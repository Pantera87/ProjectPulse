package com.pantera87.projectpulse.engine

import com.pantera87.projectpulse.data.WatchRule
import com.pantera87.projectpulse.data.db.AppDatabase
import com.pantera87.projectpulse.data.db.SnapshotEntity
import com.pantera87.projectpulse.data.db.SourceEntity
import com.pantera87.projectpulse.data.db.UpdateEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant

/**
 * Port of the state / rules / persistence helpers in src/lib/models.ts onto the
 * on-device Room schema (see [AppDatabase]): per-source `stateJson` (JSON object)
 * and `rulesJson` parsing, a plain `insertUpdate` insert, the `touchSource`
 * partial row update, and versioned snapshot storage + pruning.
 *
 * Server-only helpers are deliberately absent: `indexForSearch` (FTS5 — the
 * Android update search is a LIKE query), archived snapshot *asset* capture
 * (no on-disk asset archive) and `summarySizeFor` (no AI project summaries).
 */

/** Lenient JSON for the state / payload columns (server-side `JSON.parse`). */
internal val engineJson = Json { ignoreUnknownKeys = true; isLenient = true }

/** `new Date().toISOString()` — UTC ISO-8601 with millis. */
fun nowIso(): String = Instant.now().toString()

// --- state / rules (port of `stateOf` / `rulesOf` in models.ts) ---

/** Parses `sources.state_json` into a JSON object (empty object on parse failure). */
fun stateOf(source: SourceEntity): JsonObject =
    try {
        val el: JsonElement = engineJson.parseToJsonElement(source.stateJson)
        el as? JsonObject ?: buildJsonObject {}
    } catch (e: Exception) {
        buildJsonObject {}
    }

/** Parses `sources.rules_json` into the source's watch rules (empty on parse failure). */
fun rulesOf(source: SourceEntity): List<WatchRule> =
    try {
        engineJson.decodeFromString<List<WatchRule>>(source.rulesJson)
    } catch (e: Exception) {
        emptyList()
    }

// --- state value accessors (state_json is a JsonObject of mixed JSON) ---

/** String value for [key], null when absent or not a string. */
fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

/** String-array value for [key], empty when absent or not an array. */
fun JsonObject.strList(key: String): List<String> {
    val el = this[key] ?: return emptyList()
    val arr = el as? kotlinx.serialization.json.JsonArray ?: return emptyList()
    return arr.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
}

/** Boolean-map value for [key], empty when absent or not an object. */
fun JsonObject.boolMap(key: String): Map<String, Boolean> =
    (this[key] as? JsonObject)?.mapValues { (it.value as? JsonPrimitive)?.contentOrNull == "true" }
        ?: emptyMap()

/** Returns a copy with [key] set to the string [value] (server: `state[key] = value`). */
fun JsonObject.withStr(key: String, value: String): JsonObject =
    JsonObject(toMutableMap().apply { put(key, JsonPrimitive(value)) })

/** Returns a copy with [key] set to the string array [value]. */
fun JsonObject.withStrList(key: String, value: List<String>): JsonObject =
    JsonObject(toMutableMap().apply {
        put(key, kotlinx.serialization.json.JsonArray(value.map { JsonPrimitive(it) }))
    })

/** Returns a copy with [key] set to the boolean map [value]. */
fun JsonObject.withBoolMap(key: String, value: Map<String, Boolean>): JsonObject =
    JsonObject(toMutableMap().apply {
        put(key, JsonObject(value.mapValues { JsonPrimitive(it.value) }))
    })

/** Serialises a state object back to the `state_json` column form. */
fun stateJsonString(state: JsonObject): String =
    engineJson.encodeToString(JsonObject.serializer(), state)

/**
 * Inserts a new update row and returns its id (port of `insertUpdate` in
 * models.ts — a plain insert; title/summary truncation is done by the
 * checkers, and the FTS `indexForSearch` step is server-only).
 */
suspend fun insertUpdate(
    db: AppDatabase,
    sourceId: Long,
    priority: String,
    kind: String,
    title: String,
    summary: String?,
    url: String?,
    payload: JsonElement = buildJsonObject {},
): Long = db.updateDao().insert(
    UpdateEntity(
        sourceId = sourceId,
        priority = priority,
        kind = kind,
        title = title,
        summary = summary,
        url = url,
        payloadJson = payload.toString(),
        createdAt = nowIso(),
    )
)

/**
 * Partial update of a source row after a check (port of `touchSource` in
 * models.ts). Only non-null arguments override the current row; `lastError`
 * is always overwritten (pass null to clear it).
 */
suspend fun touchSource(
    db: AppDatabase,
    source: SourceEntity,
    lastCheckedAt: String? = null,
    stateJson: String? = null,
    lastError: String? = null,
    lastContentHash: String? = null,
    goal: String? = null,
    goalSource: String? = null,
    name: String? = null,
    logo: ByteArray? = null,
) {
    db.sourceDao().update(
        source.copy(
            lastCheckedAt = lastCheckedAt ?: source.lastCheckedAt,
            stateJson = stateJson ?: source.stateJson,
            lastError = lastError,
            lastContentHash = lastContentHash ?: source.lastContentHash,
            goal = goal ?: source.goal,
            goalSource = goalSource ?: source.goalSource,
            name = name ?: source.name,
            logo = logo ?: source.logo,
        )
    )
}

// --- snapshots (port of the snapshot parts of models.ts) ---

/** How many snapshot versions to keep per source (server: `SNAPSHOT_KEEP`, env/settings). */
const val SNAPSHOT_KEEP = 3

/** `MAX(version)` for a source, 0 when no snapshots exist (port of `maxSnapshotVersion`). */
suspend fun maxSnapshotVersion(db: AppDatabase, sourceId: Long): Int =
    db.snapshotDao().latest(sourceId)?.version ?: 0

/**
 * Stores a new snapshot version (port of the snapshot INSERT — the raw stored
 * page; on-device pages are stored compressed via [compressHtml], asset
 * archiving is server-only).
 */
suspend fun storeSnapshot(
    db: AppDatabase,
    sourceId: Long,
    version: Int,
    html: String,
    contentHash: String,
    title: String?,
): Long = db.snapshotDao().insert(
    SnapshotEntity(
        sourceId = sourceId,
        version = version,
        fetchedAt = nowIso(),
        html = html,
        contentHash = contentHash,
        title = title,
    )
)

/** Keeps only the [SNAPSHOT_KEEP] newest versions for a source (port of `pruneSnapshots`). */
suspend fun pruneSnapshots(db: AppDatabase, sourceId: Long) {
    val dropped = db.snapshotDao().versions(sourceId).drop(SNAPSHOT_KEEP)
    dropped.forEach { db.snapshotDao().delete(it) }
}
