package com.pantera87.projectpulse.engine

import com.pantera87.projectpulse.data.CheckResult
import com.pantera87.projectpulse.data.db.AppDatabase
import com.pantera87.projectpulse.data.db.SourceEntity
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Port of src/lib/checkers/rss.ts — fetches the feed, diffs the item guids
 * against the source's `seen_guids` state, and applies the source's keyword
 * rules to the newly added items.
 *
 * The first check only records the current items as the baseline (no update
 * entries). The server-only FTS indexing step is omitted; notices are routed
 * through [notifier].
 */
suspend fun checkRss(
    db: AppDatabase,
    source: SourceEntity,
    ai: EngineAi = com.pantera87.projectpulse.engine.ai,
    notifier: EngineNotifier = NullNotifier,
): CheckResult = checkFeedUrl(db, source, source.url, ai, notifier)

/**
 * The RSS check core (port of `checkFeedUrl`). [feedUrl] defaults to the
 * source's own url; RSSHub-style sources may carry a separate feed url in
 * their payload.
 */
suspend fun checkFeedUrl(
    db: AppDatabase,
    source: SourceEntity,
    feedUrl: String,
    ai: EngineAi = com.pantera87.projectpulse.engine.ai,
    notifier: EngineNotifier = NullNotifier,
): CheckResult {
    val entries: List<FeedItem>
    var feedTitle = ""
    try {
        val (title, items) = fetchFeed(feedUrl)
        feedTitle = title
        entries = items
    } catch (e: Exception) {
        val msg = e.message ?: e.toString()
        touchSource(db, source, lastCheckedAt = nowIso(), lastError = msg)
        return CheckResult(ok = false, changed = false, updatesCreated = 0, error = msg)
    }
    if (entries.isEmpty()) {
        val msg = "Feed has no items"
        touchSource(db, source, lastCheckedAt = nowIso(), lastError = msg)
        return CheckResult(ok = false, changed = false, updatesCreated = 0, error = msg)
    }

    // Goal backfill — the feed's own title as a plain auto-extraction, or the
    // AI over a sample of recent entry titles when the feed has no title. Runs
    // on every successful fetch, so a goal the user cleared is restored on the
    // next check.
    if (source.goal.isNullOrEmpty()) {
        var goal = feedTitle.trim().takeIf { it.length in 15..500 } ?: ""
        var goalSource: String? = null
        if (goal.isEmpty()) {
            val sample = entries.take(8).map { it.title }.filter { it.isNotBlank() }.joinToString("\n")
            if (sample.isNotEmpty()) {
                val aiGoal = ai.extractGoal(sample)
                if (aiGoal != null) {
                    goal = aiGoal
                    goalSource = "ai"
                }
            }
        }
        if (goal.isNotEmpty()) {
            touchSource(db, source, goal = truncate(goal, 500), goalSource = goalSource ?: "auto")
        }
    }

    val state = stateOf(source)
    val seenGuids = state.strList("seen_guids")
    val newEntries = entries.filter { it.guid !in seenGuids }
    val rules = rulesOf(source)

    // Keep the latest 300 guids so state stays bounded.
    val allGuids = entries.map { it.guid }
    val nextSeen = (seenGuids + allGuids).takeLast(300)

    if (seenGuids.isEmpty()) {
        // First check — only record the baseline, no updates.
        touchSource(db, source, lastCheckedAt = nowIso(), stateJson = stateJsonString(state.withStrList("seen_guids", nextSeen)), lastError = null)
        return CheckResult(ok = true, changed = false, updatesCreated = 0)
    }

    var updatesCreated = 0
    for (e in newEntries) {
        var priority = "normal"
        var kind = "feed_item"
        var title = e.title.ifEmpty { "New item" }
        var summary = e.contentSnippet ?: ""
        var summarySource: String? = null

        // Keyword-rule match against the new item (keyword pass first, then
        // the optional AI semantic pass — `findRuleHitSmart` handles both).
        val hit = findRuleHitSmart(
            rules,
            "feed_item",
            listOf("feed_item" to "${e.title} ${e.contentSnippet ?: ""}"),
            ai,
        )
        if (hit != null) {
            kind = "keyword"
            priority = hit.priority
        }

        // Optional AI summary + importance classification of the item.
        val aiRes = ai.summarizeUpdate("${e.title}\n${e.contentSnippet ?: ""}", title)
        if (aiRes != null) {
            summary = aiRes.summary
            summarySource = "ai"
            priority = higherPriority(priority, aiRes.priority)
        }
        if (hit?.semantic == true && !hit.semanticSummary.isNullOrEmpty()) {
            summary = hit.semanticSummary
            summarySource = "ai"
        }

        title = when {
            hit == null -> "New: ${if (e.title.isNotEmpty()) e.title else "item"}"
            hit.semantic && !hit.semanticTopic.isNullOrEmpty() -> "Topic match: ${hit.semanticTopic}"
            hit.semantic -> "AI topic match"
            else -> "Keyword \"${hit.matched.joinToString(", ")}\" in new item"
        }

        val id = insertUpdate(
            db,
            source.id,
            priority,
            kind,
            title,
            truncate(summary, 1000),
            e.link,
            buildJsonObject {
                put("guid", e.guid)
                put("title", e.title)
                put("description", e.contentSnippet)
                put("published", e.isoDate)
                put("link", e.link)
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
                url = e.link,
                priority = priority,
                kind = kind,
                sourceName = source.name ?: source.url,
                sourceUrl = source.url,
            )
        )
    }

    touchSource(
        db,
        source,
        lastCheckedAt = nowIso(),
        stateJson = stateJsonString(state.withStrList("seen_guids", nextSeen)),
        lastError = null,
    )
    return CheckResult(ok = true, changed = updatesCreated > 0, updatesCreated = updatesCreated)
}
