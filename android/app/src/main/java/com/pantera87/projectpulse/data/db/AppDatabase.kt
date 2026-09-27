package com.pantera87.projectpulse.data.db

import androidx.room.Database
import androidx.room.RoomDatabase

/**
 * Room database for the local engine — the on-device equivalent of the
 * server's `projectpulse.db` (src/lib/db.ts). Mirrors the server's
 * `sources` / `snapshots` / `updates` tables; [MetaEntity] is the server's
 * `settings` table. The server-only tables are deliberately omitted:
 * `search_index` (FTS5 → [com.pantera87.projectpulse.data.db.UpdateDao.search]
 * uses LIKE), `notification_log` (delivery goes through the Android
 * notification system), and `categories` (icons use the same keyword/hash
 * fallback as the web app).
 */
@Database(
    entities = [
        SourceEntity::class,
        UpdateEntity::class,
        SnapshotEntity::class,
        MetaEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun sourceDao(): SourceDao
    abstract fun updateDao(): UpdateDao
    abstract fun snapshotDao(): SnapshotDao
    abstract fun metaDao(): MetaDao

    /**
     * Deletes a source and everything pointing at it — snapshots, then
     * updates, then the row itself — in one transaction. The local
     * counterpart of the server's `DELETE /api/sources/:id` cascade.
     */
    /** Cascade-delete a source and its updates/snapshots in one transaction (local mode only). */
    fun deleteSourceLocal(sourceId: Long) {
        val sid = sourceId.toString()
        beginTransaction()
        try {
            openHelper.writableDatabase.execSQL("DELETE FROM snapshots WHERE sourceId = ?", arrayOf(sid))
            openHelper.writableDatabase.execSQL("DELETE FROM updates WHERE sourceId = ?", arrayOf(sid))
            openHelper.writableDatabase.execSQL("DELETE FROM sources WHERE id = ?", arrayOf(sid))
            setTransactionSuccessful()
        } finally {
            endTransaction()
        }
    }

    /**
     * Runs a raw `SELECT` and returns every row as `Array<String?>` (columns in
     * SELECT order). The escape hatch for the `/api/updates`-style query whose
     * WHERE/ORDER BY is built per call - too dynamic for a Room `@Query`.
     *
     * Uses [androidx.sqlite.db.SupportSQLiteDatabase.query] because the sqlite
     * 2.3.0 API surface has no `rawQuery` method (that overload only exists
     * on `SQLiteDatabase`/newer `SupportSQLiteOpenHelper` versions).
     */
    fun rawSelect(sql: String, args: Array<out Any?> = emptyArray()): List<Array<String?>> {
        val out = mutableListOf<Array<String?>>()
        openHelper.writableDatabase.query(sql, args).use { c ->
            val n = c.columnCount
            while (c.moveToNext()) {
                val row = arrayOfNulls<String?>(n)
                for (i in 0 until n) row[i] = if (c.isNull(i)) null else c.getString(i)
                out += row
            }
        }
        return out
    }
}
