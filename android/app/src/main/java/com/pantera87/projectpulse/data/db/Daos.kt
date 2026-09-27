package com.pantera87.projectpulse.data.db

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

    /** Unread non-normal-priority updates (the dashboard's attention list). */
    @Query("SELECT * FROM updates WHERE priority != 'normal' AND readAt IS NULL ORDER BY createdAt DESC, id DESC LIMIT :limit")
    suspend fun attention(limit: Int): List<UpdateEntity>

    /** Per-day update counts for the activity chart (server groups by date(created_at)). */
    @Query("SELECT date(createdAt) AS day, COUNT(*) AS count FROM updates WHERE createdAt >= :since GROUP BY day ORDER BY day DESC")
    suspend fun activityByDay(since: String): List<DayActivity>

    /** Case-insensitive substring search over title + summary — the local stand-in for FTS5. */
    @Query("SELECT * FROM updates WHERE title LIKE '%' || :query || '%' OR summary LIKE '%' || :query || '%' ORDER BY createdAt DESC, id DESC LIMIT :limit")
    suspend fun search(query: String, limit: Int): List<UpdateEntity>
}

/** One row of [UpdateDao.activityByDay]. */
data class DayActivity(val day: String, val count: Int)

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