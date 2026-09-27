package com.pantera87.projectpulse.data

import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.db.SourceEntity
import com.pantera87.projectpulse.data.db.UpdateEntity
import com.pantera87.projectpulse.data.db.UpdateSourceRow
import com.pantera87.projectpulse.engine.CollectorNotifier
import com.pantera87.projectpulse.engine.FetchOpts
import com.pantera87.projectpulse.engine.PpEngine
import com.pantera87.projectpulse.engine.fetchBinary
import com.pantera87.projectpulse.engine.fetchText
import com.pantera87.projectpulse.engine.nowIso
import com.pantera87.projectpulse.engine.parseGithubRef
import com.pantera87.projectpulse.engine.readHtml
import com.pantera87.projectpulse.engine.toUpdate
import com.pantera87.projectpulse.notif.Notifier
import com.pantera87.projectpulse.notif.SyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * [PpBackend] served entirely from the on-device Room database. Every method
 * is a line-by-line port of the matching server API route (src/app/api/...):
 * reads come from the local tables, and "check" runs the Phase-2 engine
 * ([PpEngine]) in-process instead of hitting `POST /api/sources/:id/check`.
 * The UI is data-source agnostic - switching `data_mode` swaps this class for
 * [RemoteBackend] with no screen changes.
 */
class LocalBackend : PpBackend {

    private val app get() = App.instance
    private val db get() = app.db
    /** The file-level "check all" run state this backend reports on. */
    private val runState get() = CheckAllState
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    // ---------------------------------------------------------------- reads

    /** Connection test + auth probe. Local mode is always "reachable". */
    override suspend fun health(): ApiResult<Health> =
        ApiResult.Ok(Health(ok = true, auth = false, time = nowIso()))

    /** A no-op on the local backend - no session to start. */
    override suspend fun login(password: String): ApiResult<Unit> = ApiResult.Ok(Unit)

    /** Port of GET /api/dashboard - the snapshot the UI polls every ~30 s. */
    override suspend fun dashboard(): ApiResult<Dashboard> {
        val today = LocalDate.now(ZoneOffset.UTC)
        val since7 = today.minusDays(6).toString()
        val days = (6 downTo 0).map { today.minusDays(it.toLong()).toString() }
        val dayIndex = days.withIndex().associate { (i, day) -> day to i }

        val sources = db.sourceDao().all()
        val byId = sources.associateBy { it.id }

        val countsRow = db.updateDao().unreadCounts()
        val categoryUnread = db.updateDao().categoryUnread().associate { it.cat to it.c.toInt() }
        val latest = db.updateDao().unreadLatest(10).map { it.toModel(byId) }
        val latestBySource = db.updateDao().latestBySource().associate { u ->
            u.sourceId.toString() to LatestUpdate(
                id = u.id.toInt(),
                kind = u.kind,
                priority = u.priority,
                title = u.title,
                created_at = u.createdAt,
            )
        }
        val attention = db.updateDao().attention(6).map { it.toModel(byId) }

        // Per-source 7-day sparklines (index 0 = 6 days ago, index 6 = today).
        val activityBySource = HashMap<String, MutableList<Int>>()
        for (r in db.updateDao().activityBySourceDay(since7)) {
            val idx = dayIndex[r.day] ?: continue
            val list = activityBySource.getOrPut(r.sourceId.toString()) { MutableList(7) { 0 } }
            list[idx] = r.c
        }

        // Whole-dashboard aggregates (hero card, gauges, 7-day chart).
        val totals = db.updateDao().updateTotals()
        val week = db.updateDao().windowStats(since7)
        val activityTotalByDay = MutableList(7) { 0 }
        for (r in db.updateDao().activityByDay(since7)) {
            val idx = dayIndex[r.day] ?: continue
            activityTotalByDay[idx] = r.count
        }
        val prevWeek = db.updateDao().countBetween(
            today.minusDays(13).toString(),
            today.minusDays(7).toString(),
        )

        return ApiResult.Ok(
            Dashboard(
                counts = UnreadCounts(
                    critical = countsRow.critical?.toInt() ?: 0,
                    high = countsRow.high?.toInt() ?: 0,
                    normal = countsRow.normal?.toInt() ?: 0,
                    total = countsRow.total?.toInt() ?: 0,
                ),
                categoryUnread = categoryUnread,
                latest = latest,
                latestBySource = latestBySource,
                activityBySource = activityBySource,
                attention = attention,
                aggregates = Aggregates(
                    totalUpdates = totals.total.toInt(),
                    readUpdates = totals.read?.toInt() ?: 0,
                    sourcesTotal = sources.size,
                    sourcesUpdatedThisWeek = week.sources.toInt(),
                    updatesThisWeek = week.updates.toInt(),
                    updatesPrevWeek = prevWeek,
                    activityTotalByDay = activityTotalByDay,
                ),
            ),
        )
    }
    /** Port of GET /api/updates - same WHERE/ORDER BY, built per call. */
    override suspend fun updates(
        priority: String?,
        sourceId: Int?,
        unreadOnly: Boolean,
        window: String?,
        limit: Int,
        offset: Int,
    ): ApiResult<UpdatesPage> {
        val where = mutableListOf<String>()
        val args = mutableListOf<String>()
        if (!priority.isNullOrBlank()) {
            where += "u.priority = ?"
            args += priority
        }
        if (sourceId != null) {
            where += "u.sourceId = ?"
            args += sourceId.toString()
        }
        if (unreadOnly) where += "u.readAt IS NULL"
        if (!window.isNullOrBlank()) {
            val days = window.substringBefore('d').toIntOrNull() ?: 7
            where += "u.createdAt >= datetime('now', ?)"
            args += "-$days days"
        }
        val lim = (if (limit > 0) limit else 100).coerceAtMost(500)
        val off = offset.coerceIn(0, 10_000)
        val sql = "SELECT u.*, s.name AS source_name, s.url AS source_url, s.type AS source_type" +
            " FROM updates u JOIN sources s ON s.id = u.sourceId" +
            (if (where.isEmpty()) "" else " WHERE " + where.joinToString(" AND ")) +
            " ORDER BY CASE u.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END," +
            " u.createdAt DESC, u.id DESC LIMIT ? OFFSET ?"
        val rows = db.rawSelect(sql, (args + listOf(lim, off)).toTypedArray()).map { r ->
            UpdateSourceRow(
                id = r[0]?.toLong() ?: 0,
                sourceId = r[1]?.toLong() ?: 0,
                priority = r[2] ?: "normal",
                kind = r[3] ?: "",
                title = r[4] ?: "",
                summary = r[5],
                url = r[6],
                payloadJson = r[7] ?: "",
                createdAt = r[8] ?: "",
                readAt = r[9],
                sourceName = r[10],
                sourceUrl = r[11],
                sourceType = r[12],
            )
        }
        return ApiResult.Ok(UpdatesPage(updates = rows.map { it.toModel() }))
    }

    /** Port of GET /api/sources - every row + its unread count. */
    override suspend fun sources(type: String?): ApiResult<List<Source>> {
        val rows = if (type.isNullOrBlank()) db.sourceDao().all() else db.sourceDao().byType(type)
        val unread = db.updateDao().unreadCountsBySource().associate { it.sourceId to it.c.toInt() }
        return ApiResult.Ok(rows.map { it.toModel(unread[it.id] ?: 0) })
    }

    /** Port of GET /api/sources/:id - the source row + its snapshot versions. */
    override suspend fun sourceDetail(id: Int): ApiResult<SourceDetail> {
        val data = db.sourceDao().detail(id.toLong()) ?: return ApiResult.Error("Not found")
        val source = data.source.toModel(db.updateDao().unreadCountBySource(id.toLong()))
        val snapshots = data.snapshots.map { s ->
            Snapshot(
                id = s.id.toInt(),
                version = s.version,
                fetched_at = s.fetchedAt,
                title = s.title,
                size = s.html.length.toLong(),
                archived = s.htmlLocal != null,
            )
        }
        return ApiResult.Ok(SourceDetail(source = source, snapshots = snapshots))
    }

    /** Port of GET /api/sources/:id/snapshot/:version - raw HTML for a WebView. */
    override suspend fun snapshotHtml(sourceId: Int, version: Int): ApiResult<String> {
        val snap = db.snapshotDao().byVersion(sourceId.toLong(), version)
            ?: return ApiResult.Error("Not found")
        return ApiResult.Ok(if (snap.htmlLocal != null) snap.htmlLocal else readHtml(snap.html))
    }

    /** Port of GET /api/search - substring over project fields + update title/summary. */
    override suspend fun search(query: String): ApiResult<SearchPage> {
        val q = query.trim()
        if (q.length < 2) return ApiResult.Ok(SearchPage())
        val byId = db.sourceDao().all().associateBy { it.id }
        val sourceRows = db.sourceDao().search(q).map { it.toModel(0) }
        val updateRows = db.updateDao().search(q, 100).map { it.toModel(byId) }
        return ApiResult.Ok(SearchPage(sources = sourceRows, updates = updateRows))
    }
    // --------------------------------------------------------------- writes

    /** Port of POST /api/sources - validation included; fires the first check. */
    override suspend fun addSource(
        type: String,
        url: String,
        name: String,
        checkIntervalHours: Int,
    ): ApiResult<Int> {
        val t = type.trim()
        val u = url.trim()
        if (t !in setOf("website", "github", "rss"))
            return ApiResult.Error("type must be website|github|rss")
        if (u.isEmpty()) return ApiResult.Error("url is required")
        if (t == "github") {
            if (parseGithubRef(u) == null)
                return ApiResult.Error("GitHub reference must be owner/repo or a github.com URL")
        } else {
            val valid = try {
                val uri = URI(u)
                !uri.scheme.isNullOrBlank() && !uri.host.isNullOrBlank()
            } catch (e: Exception) {
                false
            }
            if (!valid) return ApiResult.Error("Invalid URL")
        }
        val id = db.sourceDao().insert(
            SourceEntity(
                type = t,
                url = u,
                name = name.trim().ifEmpty { null },
                checkIntervalHours = checkIntervalHours.toDouble(),
                createdAt = nowIso(),
            ),
        )
        // The server answers with a 201 and runs a background enrichment pass;
        // locally the same happens through the one-shot worker.
        SyncScheduler.runOnce(app)
        return ApiResult.Ok(id.toInt())
    }

    /** Port of POST /api/updates - mark many updates read/unread. */
    override suspend fun markRead(ids: List<Int>, read: Boolean): ApiResult<Unit> {
        val list = ids.map { it.toLong() }
        if (list.isEmpty()) return ApiResult.Error("ids required")
        if (read) db.updateDao().markRead(list, nowIso()) else db.updateDao().markUnread(list)
        return ApiResult.Ok(Unit)
    }

    /** Port of DELETE /api/updates/:id. */
    override suspend fun deleteUpdate(id: Int): ApiResult<Unit> {
        val row = db.updateDao().byId(id.toLong()) ?: return ApiResult.Error("Not found")
        db.updateDao().delete(row)
        return ApiResult.Ok(Unit)
    }

    /** Port of DELETE /api/sources/:id - snapshots + updates + the row, one tx. */
    override suspend fun deleteSource(id: Int): ApiResult<Unit> {
        db.deleteSourceLocal(id.toLong())
        return ApiResult.Ok(Unit)
    }

    /** Port of PATCH /api/sources/:id - same allow-listed fields as the server. */
    override suspend fun patchSource(id: Int, body: String): ApiResult<Unit> {
        val row = db.sourceDao().byId(id.toLong()) ?: return ApiResult.Error("Not found")
        val obj = try {
            json.parseToJsonElement(body).jsonObject
        } catch (e: Exception) {
            return ApiResult.Error("Invalid JSON body")
        }
        var s = row
        if (obj.containsKey("name")) s = s.copy(name = strField(obj["name"]))
        // Manual edits are user-set (no "AI" badge on that field).
        if (obj.containsKey("goal")) s = s.copy(goal = strField(obj["goal"]), goalSource = "user")
        if (obj.containsKey("category"))
            s = s.copy(category = strField(obj["category"]), categorySource = "user")
        if (obj.containsKey("subcategory"))
            s = s.copy(subcategory = strField(obj["subcategory"]), subcategorySource = "user")
        if (obj.containsKey("notes")) s = s.copy(notes = strField(obj["notes"]))
        if (obj.containsKey("watch_enabled"))
            s = s.copy(watchEnabled = obj["watch_enabled"]?.jsonPrimitive?.booleanOrNull ?: true)
        if (obj.containsKey("check_interval_hours"))
            s = s.copy(checkIntervalHours = obj["check_interval_hours"]?.jsonPrimitive?.doubleOrNull ?: s.checkIntervalHours)
        if (obj.containsKey("muted_until")) {
            val v = obj["muted_until"]?.jsonPrimitive?.contentOrNull
            s = s.copy(mutedUntil = if (v == null || v.isEmpty() || v == "clear") null else v)
        }
        if (obj.containsKey("rules_json"))
            s = s.copy(rulesJson = obj["rules_json"]?.jsonPrimitive?.contentOrNull ?: "[]")
        if (obj.containsKey("track_releases"))
            s = s.copy(trackReleases = obj["track_releases"]?.jsonPrimitive?.booleanOrNull ?: true)
        if (obj.containsKey("track_readme"))
            s = s.copy(trackReadme = obj["track_readme"]?.jsonPrimitive?.booleanOrNull ?: false)
        if (obj.containsKey("track_commits"))
            s = s.copy(trackCommits = obj["track_commits"]?.jsonPrimitive?.booleanOrNull ?: false)
        if (obj.containsKey("summary_size")) {
            val v = obj["summary_size"]?.jsonPrimitive?.contentOrNull
            s = s.copy(
                summarySize = when {
                    v.isNullOrEmpty() -> null
                    v in SUMMARY_SIZES -> v
                    else -> s.summarySize // not a known size -> keep the current value
                },
            )
        }
        db.sourceDao().update(s)
        return ApiResult.Ok(Unit)
    }

    /** Port of POST /api/sources/:id/read - every update of one source. */
    override suspend fun markAllReadForSource(sourceId: Int): ApiResult<Unit> {
        db.updateDao().markAllReadForSource(sourceId.toLong(), nowIso())
        return ApiResult.Ok(Unit)
    }

    /** Port of POST /api/sources/:id/rules - persists the editor's rule list. */
    override suspend fun saveRules(id: Int, type: String, rules: List<WatchRule>): ApiResult<Unit> {
        if (db.sourceDao().byId(id.toLong()) == null) return ApiResult.Error("Not found")
        db.sourceDao().setRulesJson(id.toLong(), json.encodeToString(rules))
        return ApiResult.Ok(Unit)
    }
    // ------------------------------------------------------------- actions

    /**
     * Port of POST /api/sources/:id/check - runs the matching on-device
     * checker, then posts a notification for what it found (the server does
     * the same via its notification log).
     */
    override suspend fun checkSource(id: Int): ApiResult<CheckResult> {
        val source = db.sourceDao().byId(id.toLong()) ?: return ApiResult.Error("Not found")
        PpEngine.init(db)
        val collector = CollectorNotifier()
        val result = try {
            PpEngine.check(db, source, collector)
        } catch (e: Exception) {
            CheckResult(ok = false, changed = false, updatesCreated = 0, error = e.message ?: "Check failed")
        }
        if (result.ok && collector.notices.isNotEmpty() && app.prefs.notificationsEnabled.value) {
            Notifier.post(app, collector.notices.map { it.toUpdate() })
        }
        return ApiResult.Ok(result)
    }

    /** Port of POST /api/sources/check-all - one background run over all watched sources. */
    override suspend fun checkAll(): ApiResult<CheckAllStarted> {
        if (runState.running) {
            return ApiResult.Ok(CheckAllStarted(started = false, running = true, count = runState.total))
        }
        PpEngine.init(db)
        val sources = db.sourceDao().all().filter { it.watchEnabled }
        runState.reset(sources.size)
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            for (s in sources) {
                try {
                    if (!PpEngine.check(db, s).ok) runState.fail()
                } catch (e: Exception) {
                    runState.fail()
                }
                runState.advance()
            }
            runState.finish()
        }
        return ApiResult.Ok(CheckAllStarted(started = true, running = true, count = sources.size))
    }

    /** Port of GET /api/sources/check-all?run=0 - live progress of the run. */
    override suspend fun checkAllProgress(): ApiResult<CheckAllProgress> = ApiResult.Ok(
        CheckAllProgress(
            running = runState.running,
            checked = runState.checked,
            failed = runState.failed,
            total = runState.total,
        ),
    )

    // ------------------------------------------------- source assets / http

    /** Port of GET /api/sources/:id/logo - the stored logo bytes, or null. */
    override suspend fun logo(sourceId: Int): ByteArray? =
        db.sourceDao().byId(sourceId.toLong())?.logo?.takeIf { it.isNotEmpty() }

    /** Plain GET of an external page's HTML (favicon discovery). Null on failure. */
    override suspend fun pageHtml(url: String): String? {
        if (!url.startsWith("http")) return null
        return try {
            fetchText(url, FetchOpts(timeoutMs = 15_000, maxBytes = 200 * 1024L))
        } catch (e: Exception) {
            null
        }
    }

    /** Download one favicon file. Null when unreachable/empty/oversized. */
    override suspend fun fetchFavicon(url: String): ByteArray? {
        if (!url.startsWith("http")) return null
        return fetchBinary(url, timeoutMs = 15_000, maxBytes = 512 * 1024)
    }

    // --------------------------------------------------------------- mappers

    private fun SourceEntity.toModel(unread: Int): Source = Source(
        id = id.toInt(),
        type = type,
        url = url,
        name = name,
        goal = goal,
        project_summary = projectSummary,
        category = category,
        subcategory = subcategory,
        notes = notes,
        logo = if (logo != null && logo.isNotEmpty()) "local" else null,
        watch_enabled = if (watchEnabled) 1 else 0,
        check_interval_hours = checkIntervalHours.toInt(),
        rules_json = rulesJson,
        unread = unread,
    )

    private fun UpdateEntity.toModel(byId: Map<Long, SourceEntity>): Update = Update(
        id = id.toInt(),
        source_id = sourceId.toInt(),
        kind = kind,
        priority = priority,
        title = title,
        summary = summary,
        url = url,
        payload_json = payloadJson,
        created_at = createdAt,
        read_at = readAt,
        source_name = byId[sourceId]?.name,
        source_url = byId[sourceId]?.url,
        source_type = byId[sourceId]?.type,
    )

    private fun UpdateSourceRow.toModel() = Update(
        id = id.toInt(),
        source_id = sourceId.toInt(),
        kind = kind,
        priority = priority,
        title = title,
        summary = summary,
        url = url,
        payload_json = payloadJson,
        created_at = createdAt,
        read_at = readAt,
        source_name = sourceName,
        source_url = sourceUrl,
        source_type = sourceType,
    )

    private fun strField(el: kotlinx.serialization.json.JsonElement?): String? =
        el?.jsonPrimitive?.contentOrNull
}
/**
 * In-process progress of the current "check all" run - the local stand-in
 * for the server's `globalThis` run state (which is what
 * `GET /api/sources/check-all?run=0` reads).
 */
private object CheckAllState {
    @Volatile
    var running = false
        private set

    @Volatile
    var checked = 0
        private set

    @Volatile
    var failed = 0
        private set

    @Volatile
    var total = 0
        private set

    fun reset(size: Int) {
        total = size
        checked = 0
        failed = 0
        running = true
    }

    fun finish() {
        running = false
    }

    fun fail() {
        failed++
    }

    fun advance() {
        checked++
    }
}

/** The server's `SUMMARY_SIZES` (src/lib/models.ts). */
private val SUMMARY_SIZES = setOf("short", "medium", "long")
