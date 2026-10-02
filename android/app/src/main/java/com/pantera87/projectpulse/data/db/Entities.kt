package com.pantera87.projectpulse.data.db

import androidx.room.ColumnInfo
import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Relation

/**
 * Mirrors the server's `sources` table (src/lib/db.ts). Column names follow
 * the server's so a future export/backup tool can interoperate; [logo] stores
 * the avatar bytes directly instead of a file path relative to DATA_DIR.
 */
@Entity(tableName = "sources", indices = [Index("type")])
data class SourceEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val type: String, // "website" | "github" | "rss"
    val url: String,
    val name: String? = null,
    val goal: String? = null,
    val goalSource: String? = null,
    val category: String? = null,
    val subcategory: String? = null,
    val categorySource: String? = null,
    val subcategorySource: String? = null,
    val notes: String? = null,
    val watchEnabled: Boolean = true,
    val checkIntervalHours: Double = 6.0,
    val lastCheckedAt: String? = null,
    val lastContentHash: String? = null,
    val lastError: String? = null,
    val mutedUntil: String? = null,
    @ColumnInfo(defaultValue = "[]") val rulesJson: String = "[]",
    @ColumnInfo(defaultValue = "{}") val stateJson: String = "{}",
    val createdAt: String,
    val logo: ByteArray? = null,
    val projectSummary: String? = null,
    val summarySize: String? = null,
    val trackReleases: Boolean = true,
    val trackReadme: Boolean = false,
    val trackCommits: Boolean = false,
    // Per-track severity floors for the keywordless events (normal/high/critical).
    // Releases default to "high" — they are the headline event for most projects
    // (server parity, see src/lib/db.ts).
    val releaseSeverity: String = "high",
    val readmeSeverity: String = "normal",
    val commitSeverity: String = "normal",
)

/** Mirrors the server's `snapshots` table (one row per checked version). */
@Entity(tableName = "snapshots", indices = [Index(value = ["sourceId", "version"])])
data class SnapshotEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sourceId: Long,
    val version: Int,
    val fetchedAt: String,
    val html: String,
    val contentHash: String,
    val title: String? = null,
    val screenshot: ByteArray? = null,
    /** Self-contained archived HTML (asset URLs rewritten to local), if captured. */
    val htmlLocal: String? = null,
)

/** Mirrors the server's `updates` table — one row per detected change. */
@Entity(
    tableName = "updates",
    indices = [Index("sourceId"), Index("readAt"), Index("createdAt")],
)
data class UpdateEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sourceId: Long,
    val priority: String = "normal", // "critical" | "high" | "normal"
    val kind: String, // content_change|release|readme|commit|milestone|issue|feed_entry|keyword
    val title: String,
    val summary: String? = null,
    val url: String? = null,
    @ColumnInfo(defaultValue = "{}") val payloadJson: String = "{}",
    val createdAt: String,
    val readAt: String? = null,
)

/** The server's `settings` table: key/value for engine watermarks + flags. */
@Entity(tableName = "meta")
data class MetaEntity(
    @PrimaryKey val key: String,
    val value: String? = null,
)

/** [SourceEntity] + its snapshot versions — the shape of the source detail view. */
data class SourceDetailData(
    @Embedded val source: SourceEntity,
    @Relation(parentColumn = "id", entityColumn = "sourceId") val snapshots: List<SnapshotEntity>,
)
