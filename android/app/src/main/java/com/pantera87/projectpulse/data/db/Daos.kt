package com.pantera87.projectpulse.data.db

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/** [SourceEntity] CRUD + the dashboard's source-level queries. */
@Dao
interface SourceDao {
    @Query("SELECT * FROM sources ORDER BY createdAt DESC, id DESC")
    fun observeAll(): Flow<List<SourceEntity>>

    @Query("SELECT * FROM sources ORDER BY createdAt DESC, id DESC")
    suspend fun all(): List<SourceEntity>

    @Query("SELECT * FROM sources WHERE type = :type ORDER BY createdAt DESC, id DESC")
    suspend fun byType(type: String): List<SourceEntity>

    @Query("SELECT * FROM sources WHERE id = :id")
    suspend fun byId(id: Long): SourceEntity?

    @Query("SELECT COUNT(*) FROM sources")
    suspend fun count(): Int

    /** Source + its snapshot versions (the shape of the source detail view). */
    @Transaction
    @Query("SELECT * FROM sources WHERE id = :id")
    suspend fun detail(id: Long): SourceDetailData?

    @Insert
    suspend fun insert(source: SourceEntity): Long

    @Update
    suspend fun update(source: SourceEntity)

    @Delete
    suspend fun delete(source: SourceEntity)

    @Query("UPDATE sources SET rulesJson = :rulesJson WHERE id = :id")
    suspend fun setRulesJson(id: Long, rulesJson: String)

    /** Called by the checker after every run. */
    @Query("UPDATE sources SET lastCheckedAt = :at, lastContentHash = :hash, lastError = :error WHERE id = :id")
    suspend fun setCheckState(id: Long, at: String, hash: String?, error: String?)

    @Query("UPDATE sources SET watchEnabled = :enabled WHERE id = :id")
    suspend fun setWatchEnabled(id: Long, enabled: Boolean)

    /** Case-insensitive substring over the project fields (local port of the search endpoint's source half). */
    @Query("SELECT * FROM sources WHERE name LIKE '%' || :q || '%' OR goal LIKE '%' || :q || '%' OR url LIKE '%' || :q || '%' ORDER BY id DESC")
    suspend fun search(q: String): List<SourceEntity>
}

/** [UpdateEntity] queries matching the shapes [com.pantera87.projectpulse.data.PpBackend] serves. */
@Dao
interface UpdateDao {
    @Query("SELECT * FROM updates ORDER BY createdAt DESC, id DESC LIMIT :limit OFFSET :offset")
    suspend fun page(limit: Int, offset: Int): List<UpdateEntity>

    @Query("SELECT * FROM updates WHERE sourceId = :sourceId ORDER BY createdAt DESC, id DESC LIMIT :limit OFFSET :offset")
    suspend fun pageBySource(sourceId: Long, limit: Int, offset: Int): List<UpdateEntity>

    @Query("SELECT * FROM updates WHERE readAt IS NULL ORDER BY createdAt DESC, id DESC LIMIT :limit OFFSET :offset")
    suspend fun unreadPage(limit: Int, offset: Int): List<UpdateEntity>

    @Query("SELECT * FROM updates WHERE sourceId = :sourceId AND readAt IS NULL ORDER BY createdAt DESC, id DESC LIMIT :limit OFFSET :offset")
    suspend fun unreadPageBySource(sourceId: Long, limit: Int, offset: Int): List<UpdateEntity>

    @Query("SELECT * FROM updates WHERE id = :id")
    suspend fun byId(id: Long): UpdateEntity?

    @Insert
    suspend fun insert(update: UpdateEntity): Long

    @Update
    suspend fun update(update: UpdateEntity)

    @Delete
    suspend fun delete(update: UpdateEntity)

    @Query("UPDATE updates SET readAt = :readAt WHERE id IN (:ids)")
    suspend fun markRead(ids: List<Long>, readAt: String)

    @Query("UPDATE updates SET readAt = NULL WHERE id IN (:ids)")
    suspend fun markUnread(ids: List<Long>)

    @Query("UPDATE updates SET readAt = :readAt WHERE sourceId = :sourceId AND readAt IS NULL")
    suspend fun markAllReadForSource(sourceId: Long, readAt: String)

    @Query("SELECT COUNT(*) FROM updates WHERE readAt IS NULL")
    fun observeUnreadCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM updates WHERE readAt IS NULL")
    suspend fun unreadCount(): Int

    @Query("SELECT COUNT(*) FROM updates WHERE sourceId = :sourceId AND readAt IS NULL")
    suspend fun unreadCountBySource(sourceId: Long): Int

    /** Newest update per source (the dashboard's "latest" line per project). */
    @Query("SELECT * FROM updates WHERE id IN (SELECT MAX(id) FROM updates GROUP BY sourceId) ORDER BY createdAt DESC, id DESC")
    suspend fun latestBySource(): List<UpdateEntity>

    /** Unread critical/high updates (the dashboard's attention strip). */
    @Query("SELECT * FROM updates WHERE readAt IS NULL AND priority IN ('critical', 'high') ORDER BY priority ASC, createdAt DESC, id DESC LIMIT :limit")
    suspend fun attention(limit: Int): List<UpdateEntity>

    /** Per-day update counts for the activity chart (server groups by date(created_at)). */
    @Query("SELECT date(createdAt) AS day, COUNT(*) AS count FROM updates WHERE createdAt >= :since GROUP BY day ORDER BY day DESC")
    suspend fun activityByDay(since: String): List<DayActivity>

    /** Case-insensitive substring search over title + summary — the local stand-in for FTS5. */
    @Query("SELECT * FROM updates WHERE title LIKE '%' || :query || '%' OR summary LIKE '%' || :query || '%' ORDER BY createdAt DESC, id DESC LIMIT :limit")
    suspend fun search(query: String, limit: Int): List<UpdateEntity>

    /** Cascade helper — [AppDatabase.deleteSourceLocal] does the same in a transaction. */
    @Query("DELETE FROM updates WHERE sourceId = :sourceId")
    suspend fun deleteBySource(sourceId: Long)

    /** Per-source unread counts (the sources endpoint's `unread` field). */
    @Query("SELECT sourceId, COUNT(*) AS c FROM updates WHERE readAt IS NULL GROUP BY sourceId")
    suspend fun unreadCountsBySource(): List<SourceUnreadRow>

    /** `categoryUnread` — port of `categoryUnread` in `dashboard-aggregates.ts`. */
    @Query("SELECT COALESCE(s.category, 'uncategorized') AS cat, COUNT(*) AS c FROM updates u JOIN sources s ON s.id = u.sourceId WHERE u.readAt IS NULL GROUP BY cat")
    suspend fun categoryUnread(): List<CategoryUnreadRow>

    /** The newest unread updates across sources (the dashboard's "latest" feed). */
    @Query("SELECT * FROM updates WHERE readAt IS NULL ORDER BY createdAt DESC, id DESC LIMIT :limit")
    suspend fun unreadLatest(limit: Int): List<UpdateEntity>

    /** Per-source daily update counts over the window (`activityBySource` aggregation). */
    @Query("SELECT sourceId, date(createdAt) AS day, COUNT(*) AS c FROM updates WHERE date(createdAt) >= :since GROUP BY sourceId, day")
    suspend fun activityBySourceDay(since: String): List<SourceDayActivity>

    /** Unread counts split by priority — the dashboard's `counts`. */
    @Query("SELECT SUM(CASE WHEN readAt IS NULL AND priority = 'critical' THEN 1 ELSE 0 END) AS critical, SUM(CASE WHEN readAt IS NULL AND priority = 'high' THEN 1 ELSE 0 END) AS high, SUM(CASE WHEN readAt IS NULL AND priority = 'normal' THEN 1 ELSE 0 END) AS normal, SUM(CASE WHEN readAt IS NULL THEN 1 ELSE 0 END) AS total FROM updates")
    suspend fun unreadCounts(): UnreadCountsRow

    /** Distinct sources updated within the window (`weekActiveSources` aggregation). */
    @Query("SELECT COUNT(DISTINCT sourceId) AS sources, COUNT(*) AS updates FROM updates WHERE date(createdAt) >= :since")
    suspend fun windowStats(since: String): WindowStatsRow

    /** Total update count and how many are read. */
    @Query("SELECT COUNT(*) AS total, SUM(CASE WHEN readAt IS NOT NULL THEN 1 ELSE 0 END) AS read FROM updates")
    suspend fun updateTotals(): UpdateTotalsRow

    /** Updates newer than a source's last check (`newsSinceCheck` aggregation). */
    @Query("SELECT u.sourceId, COUNT(*) AS c FROM updates u JOIN sources s ON s.id = u.sourceId WHERE s.lastCheckedAt IS NOT NULL AND u.createdAt > s.lastCheckedAt GROUP BY u.sourceId")
    suspend fun newsSinceCheck(): List<SourceNewsCount>

    /** Update count between two UTC days inclusive (`weekPrevious` aggregation). */
    @Query("SELECT COUNT(*) FROM updates WHERE date(createdAt) >= :since AND date(createdAt) <= :until")
    suspend fun countBetween(since: String, until: String): Int
}

/** One row of [UpdateDao.activityByDay]. */
data class DayActivity(val day: String, val count: Int)

/** One row of [UpdateDao.unreadCountsBySource] — the sources endpoint's `unread` field. */
data class SourceUnreadRow(val sourceId: Long, val c: Long)

/**
 * One row of the on-device `/api/updates` shape: an [UpdateEntity] joined
 * with its source's display fields.
 *
 * **Positional contract.** This class is built positionally from
 * [AppDatabase.rawSelect] (see `LocalBackend.updates()`), not mapped by
 * Room, so its fields must keep exactly this 13-column order — the
 * `updates` table columns in [UpdateEntity] declaration order, followed
 * by the three aliased `sources` columns:
 *
 *  1.  `id`          (updates.id)
 *  2.  `sourceId`    (updates.sourceId)
 *  3.  `priority`    (updates.priority)
 *  4.  `kind`        (updates.kind)
 *  5.  `title`       (updates.title)
 *  6.  `summary`     (updates.summary)
 *  7.  `url`         (updates.url)
 *  8.  `payloadJson` (updates.payloadJson)
 *  9.  `createdAt`   (updates.createdAt)
 * 10.  `readAt`      (updates.readAt)
 * 11.  `sourceName`  (sources.name, as `source_name`)
 * 12.  `sourceUrl`   (sources.url,  as `source_url`)
 * 13.  `sourceType`  (sources.type, as `source_type`)
 *
 * Keep in lockstep with the `SELECT u.*, s.name AS source_name,
 * s.url AS source_url, s.type AS source_type` in `LocalBackend.updates()`
 * and with the `updates` table order in [UpdateEntity].
 */
data class UpdateSourceRow(
    val id: Long,
    val sourceId: Long,
    val priority: String,
    val kind: String,
    val title: String,
    val summary: String?,
    val url: String?,
    val payloadJson: String,
    val createdAt: String,
    val readAt: String?,
    @ColumnInfo(name = "source_name") val sourceName: String?,
    @ColumnInfo(name = "source_url") val sourceUrl: String?,
    @ColumnInfo(name = "source_type") val sourceType: String?,
)

/** One row of [UpdateDao.categoryUnread] — the dashboard's `categoryUnread` map. */
data class CategoryUnreadRow(val cat: String, val c: Long)

/** One row of [UpdateDao.activityBySourceDay] — feeds the `activityBySource` buckets. */
data class SourceDayActivity(val sourceId: Long, val day: String, val c: Int)

/** One row of [UpdateDao.newsSinceCheck] — feeds the `newsSinceCheck` aggregation. */
data class SourceNewsCount(val sourceId: Long, val c: Int)

/** [UpdateDao.unreadCounts] — `counts` in the dashboard response. */
data class UnreadCountsRow(
    val critical: Long? = 0,
    val high: Long? = 0,
    val normal: Long? = 0,
    val total: Long? = 0,
)

/** [UpdateDao.windowStats] — `weekActiveSources` + `weekUpdates` inputs. */
data class WindowStatsRow(val sources: Long, val updates: Long)

/** [UpdateDao.updateTotals] — `counts.total` / `counts.read`. */
data class UpdateTotalsRow(val total: Long, val read: Long?)

/** [SnapshotEntity] access for the source detail view and the archive viewer. */
@Dao
interface SnapshotDao {
    @Query("SELECT * FROM snapshots WHERE sourceId = :sourceId ORDER BY version DESC, id DESC")
    fun observeVersions(sourceId: Long): Flow<List<SnapshotEntity>>

    @Query("SELECT * FROM snapshots WHERE sourceId = :sourceId ORDER BY version DESC, id DESC")
    suspend fun versions(sourceId: Long): List<SnapshotEntity>

    @Query("SELECT * FROM snapshots WHERE sourceId = :sourceId AND version = :version")
    suspend fun byVersion(sourceId: Long, version: Int): SnapshotEntity?

    @Query("SELECT * FROM snapshots WHERE sourceId = :sourceId ORDER BY version DESC, id DESC LIMIT 1")
    suspend fun latest(sourceId: Long): SnapshotEntity?

    @Insert
    suspend fun insert(snapshot: SnapshotEntity): Long

    @Delete
    suspend fun delete(snapshot: SnapshotEntity)

    @Query("DELETE FROM snapshots WHERE sourceId = :sourceId")
    suspend fun deleteBySource(sourceId: Long)
}

/** Key/value store (the server's `settings` table) — engine watermarks + flags. */
@Dao
interface MetaDao {
    @Query("SELECT value FROM meta WHERE key = :key")
    suspend fun getValue(key: String): String?

    @Query("SELECT value FROM meta WHERE key = :key")
    fun observeValue(key: String): Flow<String?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: MetaEntity)

    @Query("DELETE FROM meta WHERE key = :key")
    suspend fun delete(key: String)
}