package com.pantera87.projectpulse.engine

import android.util.Log
import com.pantera87.projectpulse.data.CheckResult
import com.pantera87.projectpulse.data.db.AppDatabase
import com.pantera87.projectpulse.data.db.SourceEntity
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Port of src/lib/checkers/github.ts — repo metadata, the rate-limit-free
 * releases-Atom precheck, releases / milestones / labelled-issue / README /
 * commit scanning, snapshot archiving, and per-rule keyword matching.
 *
 * Server-only steps are omitted: FTS indexing, on-disk HTML archiving, and
 * file-based logo storage (the avatar bytes are stored directly on the source
 * row). Notices are routed through [notifier] so the host app can surface
 * them.
 */

/** Bullet line: `- ` / `* ` prefix (port of the `/^[-*]\s+/` regex). */
private val ghBulletRe = Regex("^[-*]\\s+")

/**
 * No-AI fallback for release notes (port of the local `salientNotesLines`
 * in github.ts): bullet lines first, otherwise plain non-empty lines,
 * capped at [cap] and joined into one readable line — the raw multi-line
 * notes would turn into a wall of text in a notification body.
 */
private fun salientNotesLines(notes: String, fallback: String, cap: Int = 4): String =
    notes.lines().map { it.trim() }.filter { it.isNotEmpty() }
        .let { lines ->
            val bullets = lines.filter { ghBulletRe.matches(it) }.map { ghBulletRe.replace(it, "") }
            if (bullets.isNotEmpty()) bullets else lines
        }
        .take(cap).joinToString(" · ")
        .ifEmpty { fallback }

suspend fun checkGithub(
    db: AppDatabase,
    source: SourceEntity,
    ai: EngineAi = com.pantera87.projectpulse.engine.ai,
    notifier: EngineNotifier = NullNotifier,
): CheckResult {
    val ref = parseGithubRef(source.url)
    if (ref == null) {
        return CheckResult(ok = false, changed = false, updatesCreated = 0, error = "Invalid GitHub reference")
    }
    val (owner, repo) = ref
    val state0 = stateOf(source)
    val rules = rulesOf(source)
    val firstRun = !state0.containsKey("seen_tags")
    var seenTags: List<String> = state0.strList("seen_tags")
    var state = state0
    var updatesCreated = 0

    // The stored name may be the auto-filled "owner/repo" full name — the
    // notification should carry just the project name (e.g. "ProjectPulse",
    // not "owner/ProjectPulse").
    val sourceNameRaw = source.name ?: repo
    val sourceName =
        if (sourceNameRaw.startsWith("$owner/")) sourceNameRaw.substring(owner.length + 1) else sourceNameRaw

    /** Inserts the update row, bumps the counter, and routes it to [notifier]. */
    suspend fun emit(
        priority: String,
        kind: String,
        title: String,
        summary: String?,
        url: String,
        payload: kotlinx.serialization.json.JsonObject,
    ) {
        val id = insertUpdate(
            db,
            source.id,
            priority,
            kind,
            truncate(title, 300),
            summary?.let { truncate(it, 1000) },
            url,
            payload,
        )
        updatesCreated++
        notifier.notify(
            EngineNotice(
                id = id,
                title = truncate(title, 300),
                summary = summary?.let { truncate(it, 300) },
                url = url,
                priority = priority,
                kind = kind,
                sourceName = sourceName,
                sourceUrl = "https://github.com/$owner/$repo",
            )
        )
    }

    // --- keyword-free change tracking (per-source UI toggles, independent of keyword rules)
    val trackReleases = source.trackReleases
    val trackReadme = source.trackReadme
    val trackCommits = source.trackCommits
    val rulesTarget: (String) -> Boolean = { k -> rules.any { k in it.sources } }
    val watchReadme = trackReadme || rulesTarget("readme")
    val watchCommits = trackCommits || rulesTarget("commits")
    val watchIssues = rules.any { !it.labels.isNullOrEmpty() }

    suspend fun processMilestones(milestones: List<GhMilestone>) {
        val known = state.boolMap("seen_milestones").toMutableMap()
        if (firstRun) {
            milestones.forEach { m -> known[m.id.toString()] = m.state == "open" }
        } else {
            for (m in milestones) {
                val key = m.id.toString()
                val wasOpen = known[key]
                val isOpen = m.state == "open"
                when {
                    wasOpen == null -> emit(
                        "high",
                        "milestone",
                        "New milestone: ${m.title}",
                        "${m.open_issues} open issue(s)" + (if (m.due_on != null) ", due ${m.due_on}" else ""),
                        m.html_url,
                        buildJsonObject {
                            put("milestone", m.title)
                            put("state", m.state)
                        },
                    )
                    wasOpen && !isOpen -> emit(
                        "high",
                        "milestone",
                        "Milestone completed: ${m.title}",
                        "${m.closed_issues} issue(s) closed",
                        m.html_url,
                        buildJsonObject {
                            put("milestone", m.title)
                            put("state", m.state)
                        },
                    )
                }
                known[key] = isOpen
            }
        }
        state = state.withBoolMap("seen_milestones", known)
    }

    // --- Cheap precheck: the releases Atom feed is a plain endpoint OUTSIDE
    // the GitHub API rate limit, so it is probed before spending a single API
    // call. The full check below still runs whenever a rule or the README
    // /commits tracker needs the API (release tags can't cover those).
    var feedUnchanged = false
    if (!firstRun) {
        try {
            val xml = fetchText(
                "https://github.com/$owner/$repo/releases.atom",
                FetchOpts(
                    timeoutMs = 15_000,
                    maxBytes = 500_000,
                    headers = mapOf("accept" to "application/atom+xml, application/xml, */*"),
                ),
            )
            val h = hashText(xml)
            feedUnchanged = state.str("prev_release_feed_hash") == h && state.str("release_feed_status") != "missing"
            state = state.withStr("prev_release_feed_hash", h).withStr("release_feed_status", "ok")
        } catch (e: Exception) {
            // A repo without releases 404s — that is a stable state too, so two
            // consecutive 404s count as "unchanged".
            val is404 = e.message?.contains("404") == true
            feedUnchanged = is404 && state.str("release_feed_status") == "missing"
            if (is404) state = state.withStr("release_feed_status", "missing")
        }
    }

    // Goal backfill (repo description) — fetched up front so it also runs on
    // the idle path below; a goal the user cleared is restored on the next check.
    if (source.goal.isNullOrEmpty()) {
        try {
            val m = EngineGithub.repo(owner, repo)
            if (m.description != null) {
                touchSource(
                    db,
                    source,
                    goal = truncate(m.description, 500),
                    goalSource = "auto", // the repo description — not AI-generated
                    name = source.name ?: repo, // the repo name only, not "owner/repo"
                )
            }
        } catch (e: Exception) {
            // best-effort — the full check below retries
        }
    }

    if (feedUnchanged && !watchReadme && !watchCommits && !watchIssues) {
        // Idle cycle: no new releases and nothing else to watch — milestones
        // (always tracked) are the only API call.
        try {
            processMilestones(EngineGithub.milestones(owner, repo))
            touchSource(db, source, lastCheckedAt = nowIso(), stateJson = stateJsonString(state), lastError = null)
            return CheckResult(ok = true, changed = updatesCreated > 0, updatesCreated = updatesCreated)
        } catch (e: Exception) {
            val msg = e.message ?: e.toString()
            touchSource(db, source, lastCheckedAt = nowIso(), stateJson = stateJsonString(state), lastError = msg)
            return CheckResult(ok = false, changed = false, updatesCreated = updatesCreated, error = msg)
        }
    }

    try {
        // --- Repo meta ---
        val meta = EngineGithub.repo(owner, repo)
        if (meta.archived) {
            touchSource(db, source, name = "${source.name ?: repo} [archived]")
        }

        // --- Project logo (repo avatar; stored on the source row, only when missing) ---
        if (source.logo == null) {
            fetchBinary(meta.owner.avatar_url)?.let { bytes ->
                touchSource(db, source, logo = bytes)
            }
        }

        // --- Offline snapshot of the repo page (versioned, hash-gated) ---
        // The page is stored with the README moved to the top, so the snapshot
        // viewer starts at the beginning of the README.
        try {
            val pageHtml = moveReadmeToTop(fetchText("https://github.com/$owner/$repo", FetchOpts(timeoutMs = 60_000)))
            val pageHash = hashText(normalizeForHash(parseHtml(pageHtml).text))
            // Also re-store when no snapshot row remains (e.g. the user deleted
            // them all), even if the page hash is unchanged.
            if (state.str("page_hash") != pageHash || maxSnapshotVersion(db, source.id) == 0) {
                val version = maxSnapshotVersion(db, source.id) + 1
                storeSnapshot(db, source.id, version, compressHtml(pageHtml), pageHash, meta.full_name)
                pruneSnapshots(db, source.id)
            }
            state = state.withStr("page_hash", pageHash)
        } catch (e: Exception) {
            // best-effort — a snapshot failure should not fail the check
            Log.w("PpEngine", "github snapshot failed for $owner/$repo: ${e.message}")
        }

        // --- Releases ---
        val releases = EngineGithub.releases(owner, repo)
        if (firstRun) {
            // First check: silently record the existing tags as the baseline.
            // GitHub returns releases newest first — baseline the bump
            // comparison against the newest existing release (in steady state
            // prev_tag = newest processed release after each check).
            seenTags = seenTags + releases.map { it.tag_name }
            releases.firstOrNull()?.let { state = state.withStr("prev_tag", it.tag_name) }
        } else {
            val newReleases = releases.filter { r -> r.tag_name !in seenTags }
            // Oldest first for prev_tag ordering
            val ordered = newReleases.sortedBy { it.published_at }
            val watchReleases = trackReleases || rulesTarget("releases")
            for (r in ordered) {
                val hit = if (watchReleases) {
                    findRuleHitSmart(
                        rules,
                        "releases",
                        listOf("releases" to "${r.name ?: ""} ${r.body ?: ""}"),
                        ai,
                    )
                } else null
                // Capture the previous tag BEFORE overwriting state.prev_tag — the
                // major-bump comparison must be against the release that came
                // before, not the tag itself.
                val prevTag = state.str("prev_tag")
                seenTags = seenTags + r.tag_name
                state = state.withStr("prev_tag", r.tag_name)
                // "Track changes: new releases" off AND no keyword hit → the tag
                // is recorded as seen but produces no update.
                if (!trackReleases && hit == null) continue
                var priority: String = "normal"
                if (hit != null) {
                    priority = hit.priority
                } else if (isMajorBump(prevTag, r.tag_name) || looksLikeMilestoneRelease(r.name ?: r.tag_name)) {
                    priority = "high"
                }
                // Per-track severity floor for the keywordless release event
                // (a keyword rule's own priority still wins — web parity).
                if (hit == null) priority = higherPriority(priority, "normal") // local: per-track severity not stored yet (floor = normal)
                // Optional AI summary + importance classification of the release
                // notes (skipped when a semantic rule match already summarised
                // them). Without AI, the raw multi-line notes are reduced to
                // their salient lines so the update stays a readable message.
                val rawNotes = listOfNotNull(r.name, r.body).filter { it.isNotEmpty() }.joinToString("\n")
                var releaseSummary: String? =
                    if (hit?.semantic == true && !hit.semanticSummary.isNullOrEmpty()) hit.semanticSummary
                    else if (rawNotes.isNotEmpty()) salientNotesLines(rawNotes, r.tag_name)
                    else null
                var releaseSummarySource: String? =
                    if (hit?.semantic == true && !hit.semanticSummary.isNullOrEmpty()) "ai" else null
                if (hit?.semantic != true) {
                    if (rawNotes.isNotEmpty()) {
                        val aiRes = ai.summarizeUpdate(rawNotes, "$owner/$repo release ${r.tag_name}")
                        if (aiRes != null) {
                            releaseSummary = aiRes.summary
                            releaseSummarySource = "ai"
                            priority = higherPriority(priority, aiRes.priority)
                        }
                    }
                }
                emit(
                    priority,
                    if (hit != null) "keyword" else "release",
                    when {
                        hit == null -> "Release ${r.tag_name}${if (r.prerelease) " (pre-release)" else ""}"
                        hit.semantic && !hit.semanticTopic.isNullOrEmpty() -> "Topic match in release ${r.tag_name}: ${hit.semanticTopic}"
                        hit.semantic -> "AI topic match in release ${r.tag_name}"
                        else -> "Keyword \"${hit.matched.joinToString(", ")}\" in release ${r.tag_name}"
                    },
                    releaseSummary,
                    r.html_url,
                    buildJsonObject {
                        put("tag", r.tag_name)
                        put("prerelease", r.prerelease)
                        put("semantic", hit?.semantic ?: false)
                        put("semanticTopic", hit?.semanticTopic)
                        put("semanticSummary", hit?.semanticSummary)
                        put("summarySource", releaseSummarySource)
                    },
                )
            }
        }
        state = state.withStrList("seen_tags", seenTags.takeLast(200))

        // --- Milestones (big project milestones, always tracked) ---
        processMilestones(EngineGithub.milestones(owner, repo))

        // --- Issue/PR label watching ---
        val labelRules = rules.filter { !it.labels.isNullOrEmpty() }
        if (labelRules.isNotEmpty()) {
            val labelSet = labelRules.flatMap { it.labels }.toSet().joinToString(",")
            val issues = EngineGithub.issues(owner, repo, labelSet)
            var seenIssues = state.strList("seen_issues")
            if (firstRun) {
                seenIssues = seenIssues + issues.map { it.number.toString() }
            } else {
                for (i in issues) {
                    if (i.number.toString() in seenIssues) continue
                    val lbl = i.labels.firstOrNull()?.name ?: ""
                    val rule = labelRules.firstOrNull { r -> r.labels.any { l -> l.equals(lbl, ignoreCase = true) } }
                    // Optional AI summary + importance classification of the
                    // issue (title + body).
                    var issuePriority: String = rule?.priority ?: "normal"
                    var issueSummary: String? = null
                    val issueText = listOf(i.title, i.body ?: "").filter { it.isNotEmpty() }.joinToString("\n")
                    val aiRes = ai.summarizeUpdate(issueText, "$owner/$repo issue #${i.number}")
                    if (aiRes != null) {
                        issueSummary = aiRes.summary
                        issuePriority = higherPriority(issuePriority, aiRes.priority)
                    }
                    emit(
                        issuePriority,
                        "issue",
                        "Labeled \"$lbl\": ${i.title}",
                        issueSummary,
                        i.html_url,
                        // Issue summaries only ever come from AI (or are absent).
                        buildJsonObject {
                            put("label", lbl)
                            put("number", i.number)
                            put("summarySource", if (issueSummary != null) "ai" else null)
                        },
                    )
                    seenIssues = seenIssues + i.number.toString()
                }
            }
            state = state.withStrList("seen_issues", seenIssues.takeLast(300))
        }

        // --- README + commits: keyword-free change tracking and/or keyword
        // scans (state-change detection). Nothing is fetched when neither the
        // track toggle nor any rule targets that area.
        for (scan in listOf("readme", "commits")) {
            if (scan == "readme" && !watchReadme) continue
            if (scan != "readme" && !watchCommits) continue
            var text = ""
            // Where a match links (instead of the repo root): the README blob
            // URL for README hits, individual commits for commit hits.
            var readmeUrl: String? = null
            var commits: List<GhCommit> = emptyList()
            if (scan == "readme") {
                val info = EngineGithub.readmeInfo(owner, repo)
                text = info?.text ?: ""
                readmeUrl = info?.htmlUrl
                // Keyword-free "README changed" tracking (hash + stored-text diff)
                if (trackReadme && text.isNotEmpty()) {
                    val h = hashText(text)
                    val prevHash = state.str("readme_hash")
                    when {
                        prevHash == null -> state = state.withStr("readme_hash", h) // baseline — no update
                        h != prevHash -> {
                            val prevText = state.str("readme_text") ?: ""
                            val patch = createPatch("README.md", prevText, text, "README.md", "README.md", 1)
                            val added = addedLines(patch)
                            // Optional AI summary + importance classification of the
                            // README change (diff as input; heuristic added lines as
                            // the fallback).
                            var readmePriority: String = "normal" // local: per-track severity not stored yet
                            var readmeSummary = truncate(added.take(10).joinToString("\n").ifEmpty { "README changed" }, 1000)
                            val aiRes = ai.summarizeUpdate(patch, "$owner/$repo README")
                            if (aiRes != null) {
                                readmeSummary = aiRes.summary
                                readmePriority = higherPriority(readmePriority, aiRes.priority)
                            }
                            emit(
                                readmePriority,
                                "readme",
                                "README updated",
                                truncate(readmeSummary, 1000),
                                readmeUrl ?: "https://github.com/$owner/$repo",
                                // Without AI the summary is the heuristic added-line list.
                                buildJsonObject {
                                    put("added", JsonArray(added.take(30).map { JsonPrimitive(it) }))
                                    put("summarySource", if (aiRes != null) "ai" else null)
                                },
                            )
                            state = state.withStr("readme_hash", h)
                        }
                    }
                    state = state.withStr("readme_text", text.take(20_000))
                }
            } else {
                commits = EngineGithub.commits(owner, repo, 30)
                text = commits.joinToString("\n") { it.commit.message }
                // Keyword-free "new commits" tracking (SHA bookkeeping)
                if (trackCommits) {
                    val seenShas = state.strList("seen_commit_shas")
                    if (seenShas.isEmpty()) {
                        state = state.withStrList("seen_commit_shas", commits.map { it.sha }) // baseline
                    } else {
                        val fresh = commits.filter { c -> c.sha !in seenShas }.reversed() // oldest first
                        // Optional AI summary + importance classification per commit.
                        // Capped: summarising more than 10 at once would be a burst
                        // of LLM calls for little extra value.
                        val useAI = fresh.size <= 10
                        for (c in fresh) {
                            var commitPriority: String = "normal" // local: per-track severity not stored yet
                            var commitSummary: String? = null
                            if (useAI) {
                                val aiRes = ai.summarizeUpdate(c.commit.message, "$owner/$repo commit")
                                if (aiRes != null) {
                                    commitSummary = aiRes.summary
                                    commitPriority = higherPriority(commitPriority, aiRes.priority)
                                }
                            }
                            emit(
                                commitPriority,
                                "commit",
                                "Commit: ${c.commit.message.lineSequence().first().take(120)}",
                                commitSummary,
                                c.html_url,
                                // Commit summaries only ever come from AI (or are absent).
                                buildJsonObject {
                                    put("sha", c.sha)
                                    put("summarySource", if (commitSummary != null) "ai" else null)
                                },
                            )
                        }
                        state = state.withStrList("seen_commit_shas", (seenShas + commits.map { it.sha }).takeLast(300))
                    }
                }
            }
            for (rule in rules) {
                if (scan !in rule.sources) continue
                // Keyword pass first; the AI semantic second pass only runs when
                // the keyword pass found nothing. The state-change bookkeeping
                // below dedupes repeated matches across checks for both kinds of
                // hits.
                val hit = findRuleHitSmart(
                    listOf(rule),
                    scan,
                    listOf(scan to text),
                    ai,
                )
                val key = "$scan:${rule.id}"
                val previouslyMatched = state.boolMap("readme_matched")[key] == true
                if (hit != null && !previouslyMatched) {
                    // Link the update directly to where the match lives:
                    //  - README: the README file itself, with a best-effort anchor
                    //    to the section containing the matched keyword;
                    //  - commits: the (newest) commit whose message contains one of
                    //    the matched keywords — semantic hits have no literal keyword,
                    //    so they link to the repo's commit list instead.
                    var url = "https://github.com/$owner/$repo"
                    var commitSha: String? = null
                    if (scan == "readme") {
                        if (readmeUrl != null) {
                            url = readmeUrl
                            if (!hit.semantic && hit.matched.isNotEmpty()) {
                                val anchor = markdownSectionAnchor(text, hit.matched.first())
                                if (anchor != null) url = "$readmeUrl#$anchor"
                            }
                        }
                    } else {
                        url = "https://github.com/$owner/$repo/commits"
                        if (!hit.semantic && hit.matched.isNotEmpty()) {
                            val found = commits.firstOrNull { c ->
                                hit.matched.any { kw ->
                                    if (Regex("^[a-z0-9]+$", RegexOption.IGNORE_CASE).matches(kw)) {
                                        Regex("\\b${Regex.escape(kw)}\\b", RegexOption.IGNORE_CASE).containsMatchIn(c.commit.message)
                                    } else {
                                        c.commit.message.contains(kw, ignoreCase = true)
                                    }
                                }
                            }
                            if (found != null) {
                                url = found.html_url
                                commitSha = found.sha
                            }
                        }
                    }
                    emit(
                        hit.priority,
                        "keyword",
                        when {
                            hit.semantic && !hit.semanticTopic.isNullOrEmpty() -> "Topic match in $scan: ${hit.semanticTopic}"
                            hit.semantic -> "AI topic match now present in $scan"
                            else -> "Keyword \"${hit.matched.joinToString(", ")}\" now present in $scan"
                        },
                        hit.semanticSummary,
                        url,
                        buildJsonObject {
                            put("scan", scan)
                            put("keywords", JsonArray(hit.matched.map { JsonPrimitive(it) }))
                            put("semantic", hit.semantic)
                            put("semanticTopic", hit.semanticTopic)
                            put("semanticSummary", hit.semanticSummary)
                            put("commitSha", commitSha)
                        },
                    )
                }
                val matched = state.boolMap("readme_matched").toMutableMap()
                matched[key] = hit != null
                state = state.withBoolMap("readme_matched", matched)
            }
        }

        touchSource(
            db,
            source,
            lastCheckedAt = nowIso(),
            stateJson = stateJsonString(state),
            lastError = null,
        )
        return CheckResult(ok = true, changed = updatesCreated > 0, updatesCreated = updatesCreated)
    } catch (e: Exception) {
        val msg = e.message ?: e.toString()
        touchSource(db, source, lastCheckedAt = nowIso(), lastError = msg)
        return CheckResult(ok = false, changed = false, updatesCreated = updatesCreated, error = msg)
    }
}
