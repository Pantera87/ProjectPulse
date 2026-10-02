package com.pantera87.projectpulse.data

import kotlinx.serialization.Serializable

/** GET /api/health — exempt from auth; doubles as a connection test. */
@Serializable
data class Health(
    val ok: Boolean,
    val auth: Boolean = false,
    val scheduler: SchedulerInfo? = null,
    val ai: AiInfo? = null,
    val webhook: Boolean = false,
    val time: String? = null,
)

@Serializable
data class SchedulerInfo(
    val running: Boolean = false,
    val busy: Boolean = false,
    val lastTick: String? = null,
    val tickCount: Int = 0,
    val intervalMinutes: Int = 0,
)

@Serializable
data class AiInfo(
    val enabled: Boolean = false,
    val provider: String? = null,
    val model: String? = null,
)

/** GET /api/dashboard — the snapshot the client polls every ~30 s. */
@Serializable
data class Dashboard(
    val counts: UnreadCounts,
    val categoryUnread: Map<String, Int> = emptyMap(),
    val latest: List<Update> = emptyList(),
    val latestBySource: Map<String, LatestUpdate> = emptyMap(),
    val activityBySource: Map<String, List<Int>> = emptyMap(),
    /** Updates created since the last check of each source ("+N since last check"). */
    val newsSinceCheck: Map<String, Int> = emptyMap(),
    val attention: List<Update> = emptyList(),
    val aggregates: Aggregates? = null,
)

/** Whole-dashboard aggregates (null on servers that predate the field). */
@Serializable
data class Aggregates(
    val totalUpdates: Int = 0,
    val readUpdates: Int = 0,
    /** 7-day windowed pair — feeds the read-rate gauge (null on pre-window servers). */
    val totalUpdates7d: Int? = null,
    val readUpdates7d: Int = 0,
    val sourcesTotal: Int = 0,
    val sourcesUpdatedThisWeek: Int = 0,
    val updatesThisWeek: Int = 0,
    val updatesPrevWeek: Int = 0,
    val activityTotalByDay: List<Int> = emptyList(),
) {
    /** Read-rate card denominator: the 7-day window when the server provides it, all-time otherwise. */
    val readRateTotal: Int get() = totalUpdates7d ?: totalUpdates
    /** Read-rate card numerator, matched to [readRateTotal]. */
    val readRateRead: Int get() = if (totalUpdates7d != null) readUpdates7d else readUpdates
}

@Serializable
data class UnreadCounts(
    val critical: Int = 0,
    val high: Int = 0,
    val normal: Int = 0,
    val total: Int = 0,
)

/** One row of /api/updates — the union of columns from updates + sources. */
@Serializable
data class Update(
    val id: Int,
    val source_id: Int? = null,
    val kind: String = "",
    val priority: String = "normal",
    val title: String = "",
    val summary: String? = null,
    val url: String? = null,
    val payload_json: String? = null,
    val created_at: String = "",
    val read_at: String? = null,
    val source_name: String? = null,
    val source_url: String? = null,
    val source_type: String? = null,
) {
    val isRead: Boolean get() = read_at != null
    val isAi: Boolean get() = !summary.isNullOrEmpty() && summary.startsWith("AI:")
}

@Serializable
data class LatestUpdate(
    val id: Int,
    val kind: String = "",
    val priority: String = "normal",
    val title: String = "",
    val created_at: String = "",
)

/** GET /api/updates?… → { updates: [...] } */
@Serializable
data class UpdatesPage(
    val updates: List<Update> = emptyList(),
)

/** GET /api/search?q=… → { sources: [...], updates: [...] } */
@Serializable
data class SearchPage(
    val sources: List<Source> = emptyList(),
    val updates: List<Update> = emptyList(),
)

/** GET /api/sources → row of the sources table + unread count. */
@Serializable
data class Source(
    val id: Int,
    val type: String = "",
    val url: String = "",
    val name: String? = null,
    val goal: String? = null,
    val project_summary: String? = null,
    val category: String? = null,
    val subcategory: String? = null,
    val notes: String? = null,
    /** Relative path of the stored repo logo (github sources); null when absent. */
    val logo: String? = null,
    val watch_enabled: Int? = 1,
    val check_interval_hours: Int? = 6,
    val rules_json: String? = null,
    val unread: Int = 0,
    /** Keywordless change-tracking (server 0/1, defaults 1/0/0); null when absent. */
    val track_releases: Int? = null,
    val track_readme: Int? = null,
    val track_commits: Int? = null,
    /** Per-track severity floor ("normal" | "high" | "critical"); null on older servers. */
    val release_severity: String? = null,
    val readme_severity: String? = null,
    val commit_severity: String? = null,
    /** Last scheduler/checker run (ISO 8601); null on very old servers. */
    val last_checked_at: String? = null,
    /** Error message of the last failed check, if any. */
    val last_error: String? = null,
    /** While this timestamp is in the future, new updates are hidden (muted). */
    val muted_until: String? = null,
) {
    val displayName: String get() = name?.takeIf { it.isNotBlank() } ?: url
    /** Web parity: the source is muted while `muted_until` is still ahead of now. */
    val isMuted: Boolean
        get() = muted_until?.let { iso ->
            try { java.time.Instant.parse(iso).isAfter(java.time.Instant.now()) } catch (e: Exception) { false }
        } ?: false
    /** Web parity: `track_releases ?? 1 !== 0` — tracked unless explicitly off. */
    val tracksReleases: Boolean get() = track_releases?.let { it != 0 } ?: true
    val tracksReadme: Boolean get() = track_readme == 1
    val tracksCommits: Boolean get() = track_commits == 1

    /** Per-track severity floors (releases default to "high" — server parity). */
    val releaseSeverity: String get() = release_severity?.takeIf { it.isNotBlank() } ?: "high"

    val readmeSeverity: String get() = readme_severity?.takeIf { it.isNotBlank() } ?: "normal"

    val commitSeverity: String get() = commit_severity?.takeIf { it.isNotBlank() } ?: "normal"
}

/** One stored snapshot version of a source (GET /api/sources/:id). */
@Serializable
data class Snapshot(
    val id: Int = 0,
    val version: Int = 0,
    val fetched_at: String = "",
    val title: String? = null,
    val size: Long? = null,
    val archived: Boolean? = null,
) {
    val sizeLabel: String
        get() = when {
            size == null -> ""
            size < 1024 -> "$size B"
            else -> "${size / 1024} KB"
        }
}

/** GET /api/sources/:id — the source row + its snapshot versions. */
@Serializable
data class SourceDetail(
    val source: Source,
    val snapshots: List<Snapshot> = emptyList(),
)

/** POST /api/sources/:id/check — result of running the checker now. */
@Serializable
data class CheckResult(
    val ok: Boolean = false,
    val changed: Boolean = false,
    val updatesCreated: Int = 0,
    val error: String? = null,
)

/** POST /api/sources/check-all — start (or report an in-flight) run. */
@Serializable
data class CheckAllStarted(
    val started: Boolean? = null,
    val running: Boolean? = null,
    val count: Int? = null,
    val type: String? = null,
)

/** GET /api/sources/check-all?run=0 — live progress of a running check-all. */
@Serializable
data class CheckAllProgress(
    val running: Boolean? = null,
    val checked: Int = 0,
    val failed: Int = 0,
    val total: Int = 0,
    val type: String? = null,
)

/**
 * One row of a source's `rules_json` array — the web editor's `WatchRule`
 * shape: `type` (include/exclude), the `keywords` that flag an update, the
 * `sources` fields they're searched in, plus optional `priority`/`labels`/
 * `negate`. Stored as a JSON string column, not a table.
 */
@Serializable
data class WatchRule(
    val id: String? = null,
    val type: String = "include",
    val priority: String? = null,
    val keywords: List<String> = emptyList(),
    val sources: List<String> = emptyList(),
    val negate: List<String> = emptyList(),
    val labels: List<String> = emptyList(),
) {
    /** True when every list is empty/blank — such a rule flags nothing. */
    val isBlank: Boolean
        get() = keywords.all { it.isBlank() } &&
            negate.all { it.isBlank() } &&
            labels.all { it.isBlank() }
}