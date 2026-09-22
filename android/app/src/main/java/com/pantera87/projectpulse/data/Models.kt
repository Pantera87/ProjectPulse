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
    val attention: List<Update> = emptyList(),
)

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
    val category: String? = null,
    val subcategory: String? = null,
    val notes: String? = null,
    val watch_enabled: Int? = 1,
    val check_interval_hours: Int? = 6,
    val unread: Int = 0,
) {
    val displayName: String get() = name?.takeIf { it.isNotBlank() } ?: url
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