package com.pantera87.projectpulse.engine

import com.pantera87.projectpulse.data.WatchRule

/**
 * Port of src/lib/rules.ts — keyword/regex rule matching against normalized
 * text segments, plus the version/release heuristics the GitHub checker uses.
 */

/** Priority order (lower = more urgent). */
val PRIORITY_ORDER: Map<String, Int> = mapOf("critical" to 0, "high" to 1, "normal" to 2)

/** A rule hit (port of `RuleHit`). */
data class RuleHit(
    val rule: WatchRule,
    val priority: String,
    val matched: List<String>,
    val semantic: Boolean = false,
    val semanticSummary: String? = null,
    val semanticTopic: String? = null,
)

/** Returns the higher-priority of two (port of `higherPriority`). */
fun higherPriority(a: String, b: String): String =
    if ((PRIORITY_ORDER[a] ?: 0) >= (PRIORITY_ORDER[b] ?: 0)) a else b

/** Case-insensitive word-boundary match for a keyword (port of `wordBoundary`). */
private fun wordBoundary(kw: String): Regex {
    val esc = Regex.escape(kw)
    return Regex("\\b$esc\\b", RegexOption.IGNORE_CASE)
}

/**
 * Keywords (case-insensitive, word boundaries) matched against text, with
 * `negate` filters vetoing the match (port of `ruleMatchesText`).
 * Returns the list of matched keywords, or empty if none / negated.
 */
fun ruleMatchesText(rule: WatchRule, text: String): List<String> {
    if (text.isEmpty()) return emptyList()
    val matched = rule.keywords.filter { wordBoundary(it).containsMatchIn(text) }
    if (matched.isEmpty()) return emptyList()
    for (neg in rule.negate) if (wordBoundary(neg).containsMatchIn(text)) return emptyList()
    return matched
}

/**
 * Finds the best (highest-priority) rule hit across the given text segments
 * (port of `findRuleHit`).
 */
fun findRuleHit(rules: List<WatchRule>, sourceKind: String, texts: List<Pair<String, String>>): RuleHit? {
    var best: RuleHit? = null
    for (rule in rules) {
        if (sourceKind !in rule.sources) continue
        for ((_, text) in texts) {
            val matched = ruleMatchesText(rule, text)
            if (matched.isNotEmpty()) {
                val hit = RuleHit(rule, rule.priority ?: "normal", matched)
                if (best == null || (PRIORITY_ORDER[hit.priority] ?: 2) < (PRIORITY_ORDER[best.priority] ?: 2)) best = hit
                break
            }
        }
    }
    return best
}

/**
 * Like [findRuleHit], but when no keyword matches and AI is enabled, asks the
 * AI for a semantic topic match (port of `findRuleHitSmart`). With [LocalAi]
 * (AI off) this behaves exactly like [findRuleHit].
 */
suspend fun findRuleHitSmart(rules: List<WatchRule>, sourceKind: String, texts: List<Pair<String, String>>, ai: EngineAi): RuleHit? {
    val hit = findRuleHit(rules, sourceKind, texts)
    if (hit != null) return hit
    if (!ai.enabled) return null
    val candidates = rules.filter { sourceKind in it.sources && it.keywords.isNotEmpty() }
    if (candidates.isEmpty()) return null
    val keywords = candidates.flatMap { it.keywords }.distinct()
    for ((_, text) in texts) {
        if (text.isEmpty()) continue
        val sm = runCatching { ai.semanticMatch(text, keywords) }.getOrNull() ?: continue
        val best = candidates.minByOrNull { PRIORITY_ORDER[it.priority ?: "normal"] ?: 2 } ?: continue
        return RuleHit(
            rule = best,
            priority = sm.priority,
            matched = emptyList(),
            semantic = true,
            semanticSummary = sm.summary,
            semanticTopic = sm.topic,
        )
    }
    return null
}

// --- Version/release heuristics (port of the helpers in checkers/github.ts) ---

/** Parses `v1.2.3` / `1.2.3` (case-insensitive leading v) into (major, minor, patch). */
fun parseSemver(tag: String): Triple<Int, Int, Int>? {
    val m = Regex("^v?(\\d+)\\.(\\d+)\\.(\\d+)", RegexOption.IGNORE_CASE).find(tag) ?: return null
    return Triple(m.groupValues[1].toInt(), m.groupValues[2].toInt(), m.groupValues[3].toInt())
}

/** True if `next` is a major-version bump over `prev` (port of `isMajorBump`). */
fun isMajorBump(prev: String?, next: String): Boolean {
    if (prev.isNullOrEmpty()) return false
    val a = parseSemver(prev) ?: return false
    val b = parseSemver(next) ?: return false
    return b.first > a.first
}

private val STABLE_HINTS = Regex("\\b(stable|ga|general availability|major)\\b|(?<![.\\d])1\\.0(?![.\\d])", RegexOption.IGNORE_CASE)

/** Heuristic: does the release title look like a milestone/stable drop? */
fun looksLikeMilestoneRelease(title: String): Boolean = STABLE_HINTS.containsMatchIn(title)

/** Appends `item` to `list`, keeping only the last `cap` entries (port of `pushCap`). */
fun <T> pushCap(list: List<T>, item: T, cap: Int): List<T> = (list + item).takeLast(cap)
