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
}
