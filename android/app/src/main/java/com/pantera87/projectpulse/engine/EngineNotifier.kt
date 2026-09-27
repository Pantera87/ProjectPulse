package com.pantera87.projectpulse.engine

import com.pantera87.projectpulse.data.Update

/**
 * One detected update, for the host app to surface (Android notification).
 * Mirrors the payload passed to `notify` in the server's checkers (src/lib/notifiers.ts).
 */
data class EngineNotice(
    val id: Long,
    val title: String,
    val summary: String?,
    val url: String?,
    val priority: String,
    val kind: String,
    val sourceName: String,
    val sourceUrl: String,
)

/** Sink for notices produced while checking a source. */
interface EngineNotifier {
    fun notify(notice: EngineNotice)
}

/** Discards notices (background runs where the caller doesn't care). */
object NullNotifier : EngineNotifier {
    override fun notify(notice: EngineNotice) {}
}

/** Collects notices so the caller can post them (e.g. as Android notifications). */
class CollectorNotifier : EngineNotifier {
    val notices = mutableListOf<EngineNotice>()
    override fun notify(notice: EngineNotice) {
        notices.add(notice)
    }
}

/** Maps a notice onto the app's [Update] row shape so [Notifier.post] can render it. */
fun EngineNotice.toUpdate(): Update = Update(
    id = id.toInt(),
    title = title,
    summary = summary,
    url = url,
    priority = priority,
    kind = kind,
    source_name = sourceName,
    source_url = sourceUrl,
)
