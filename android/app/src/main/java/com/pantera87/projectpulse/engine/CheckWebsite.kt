package com.pantera87.projectpulse.engine

import com.pantera87.projectpulse.data.CheckResult
import com.pantera87.projectpulse.data.db.AppDatabase
import com.pantera87.projectpulse.data.db.SourceEntity
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Port of src/lib/checkers/website.ts — fetches the page, stores a snapshot,
 * detects content changes via a hash of the normalised main text, and applies
 * the source's keyword rules to the diff.
 *
 * The first check only stores a baseline snapshot (no update entry). The
 * server-only FTS indexing step is omitted; notices are routed through
 * [notifier] so the host app can surface them.
 */
suspend fun checkWebsite(
    db: AppDatabase,
    source: SourceEntity,
    ai: EngineAi = com.pantera87.projectpulse.engine.ai,
    notifier: EngineNotifier = NullNotifier,
): CheckResult {
    val html: String
    try {
        html = fetchText(source.url)
    } catch (e: Exception) {
        val msg = e.message ?: e.toString()
        touchSource(db, source, lastCheckedAt = nowIso(), lastError = msg)
        return CheckResult(ok = false, changed = false, updatesCreated = 0, error = msg)
    }

    val page = parseHtml(html)

    // Goal backfill — runs on every successful fetch, so a goal the user
    // cleared is restored on the next check.
    if (source.goal.isNullOrEmpty()) {
        var goal = extractGoalFromPage(page)
        var goalSource: String? = null
        if (page.metaDescription.isNullOrEmpty()) {
            val aiGoal = ai.extractGoal(page.text)
            if (aiGoal != null) {
                goal = aiGoal
                goalSource = "ai"
            }
        }
        if (goal.isNotEmpty()) {
            touchSource(db, source, goal = truncate(goal, 500), goalSource = goalSource ?: "auto")
        }
    }

    val normalized = normalizeForHash(page.text)
    val newHash = hashText(normalized)
    val firstCheck = source.lastContentHash.isNullOrEmpty()
    val state = stateOf(source)
    // Whether a snapshot is actually still stored — the user may have deleted
    // them all, in which case the next check silently re-stores a fresh
    // baseline copy (no change update is raised for it).
    val rebaseline = !firstCheck && maxSnapshotVersion(db, source.id) == 0

    if (!firstCheck && !rebaseline && newHash == source.lastContentHash) {
        touchSource(db, source, lastCheckedAt = nowIso(), stateJson = stateJsonString(state), lastError = null)
        return CheckResult(ok = true, changed = false, updatesCreated = 0)
    }

    // Fetch the previous snapshot before inserting the new one.
    val prev = db.snapshotDao().latest(source.id)

    // Store the new snapshot version (raw stored page; asset archiving is server-only).
    val version = maxSnapshotVersion(db, source.id) + 1
    storeSnapshot(db, source.id, version, compressHtml(html), newHash, page.title.ifEmpty { null })
    pruneSnapshots(db, source.id)

    var updatesCreated = 0
    if (!firstCheck && !rebaseline) {
        val prevPage = prev?.let { parseHtml(readHtml(it.html)) }
        val prevNorm = if (prevPage != null) normalizeForHash(prevPage.text) else ""

        val diff = createPatch("content", prevNorm, normalized, "before", "after", 2)
        val added = addedLines(diff)
        val removed = removedLines(diff)

        val diffText = truncate(diff, 8000)

        // Rule match: first against the newly added lines, then against the whole new text.
        val hit = findRuleHitSmart(
            rulesOf(source),
            "content",
            listOf(
                "content" to added.joinToString("\n"),
                "content" to normalized,
            ),
            ai,
        )

        var priority = hit?.priority ?: "normal"
        val name = source.name?.takeIf { it.isNotBlank() }
            ?: page.title.takeIf { it.isNotEmpty() }
            ?: source.url

        // Optional AI summary + importance classification of the change.
        var summary: String = added.take(8).joinToString(" | ").ifEmpty { "Page content changed" }
        var summarySource: String? = null
        val aiSummary = ai.summarizeUpdate(diffText, name)
        if (aiSummary != null) {
            summary = aiSummary.summary
            summarySource = "ai"
            priority = higherPriority(priority, aiSummary.priority)
        }
        if (hit?.semantic == true && !hit.semanticSummary.isNullOrEmpty()) {
            summary = hit.semanticSummary
            summarySource = "ai"
        }

        val kind = if (hit != null) "keyword" else "content_change"
        val title = when {
            hit == null -> "Page updated: $name"
            hit.semantic && !hit.semanticTopic.isNullOrEmpty() -> "Topic match: $name — ${hit.semanticTopic}"
            hit.semantic -> "AI topic match: $name"
            else -> "Keyword \"${hit.matched.joinToString(", ")}\" detected: $name"
        }
        val id = insertUpdate(
            db,
            source.id,
            priority,
            kind,
            title,
            truncate(summary, 1000),
            source.url,
            buildJsonObject {
                put("diff", truncate(diffText, 5000))
                put("added", JsonArray(added.take(30).map { JsonPrimitive(it) }))
                put("removed", JsonArray(removed.take(30).map { JsonPrimitive(it) }))
                put("snapshotVersion", version)
                put("semantic", hit?.semantic ?: false)
                put("semanticTopic", hit?.semanticTopic)
                put("semanticSummary", hit?.semanticSummary)
                put("summarySource", summarySource)
            },
        )
        updatesCreated++
        notifier.notify(
            EngineNotice(
                id = id,
                title = truncate(title, 300),
                summary = truncate(summary, 300),
                url = source.url,
                priority = priority,
                kind = kind,
                sourceName = name,
                sourceUrl = source.url,
            )
        )
    }

    touchSource(
        db,
        source,
        lastCheckedAt = nowIso(),
        stateJson = stateJsonString(state),
        lastContentHash = newHash,
        lastError = null,
    )
    return CheckResult(ok = true, changed = !firstCheck && !rebaseline, updatesCreated = updatesCreated)
}