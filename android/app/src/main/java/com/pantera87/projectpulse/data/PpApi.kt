package com.pantera87.projectpulse.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import java.io.IOException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class Error(
        val message: String,
        val needsAuth: Boolean = false,
        val authDisabled: Boolean = false,
    ) : ApiResult<Nothing>
}

/**
 * Thin OkHttp client for the ProjectPulse server. All endpoints return
 * JSON; the one exception is a snapshot page, which returns raw HTML.
 */
class PpApi(baseUrl: String, private val jar: SessionCookieJar) {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        // A null where a non-null-with-default is declared (e.g. a NULL title
        // column) falls back to the default instead of throwing.
        coerceInputValues = true
    }

    private val base = baseUrl.trimEnd('/')

    private val client = OkHttpClient.Builder()
        .cookieJar(jar)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    // A single "Check now" fetches + screenshots one page and can outlast the
    // 30 s read timeout, so the check call gets its own, longer window.
    private val checkClient = OkHttpClient.Builder()
        .cookieJar(jar)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .build()

    // No cookie jar: /api/health is exempt from auth and must stay clean.
    private val healthClient = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .build()

    /** Connection test + auth probe. Exempt from the server's auth gate. */
    suspend fun health(): ApiResult<Health> = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder().url("$base/api/health").build()
            healthClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@use ApiResult.Error("Server responded ${resp.code}")
                val body = resp.body?.string() ?: return@use ApiResult.Error("Empty response")
                try {
                    ApiResult.Ok(json.decodeFromString(body))
                } catch (e: Exception) {
                    ApiResult.Error("Unexpected health response — update the app?")
                }
            }
        } catch (e: IOException) {
            ApiResult.Error("Cannot reach server — check the URL and that the server is running")
        }
    }

    /** POST /api/auth — sets the pp_session cookie in the jar. */
    suspend fun login(password: String): ApiResult<Unit> = withContext(Dispatchers.IO) {
        val payload = json.encodeToString(LoginBody(password))
        val req = Request.Builder()
            .url("$base/api/auth")
            .post(payload.toRequestBody(JSON))
            .build()
        try {
            client.newCall(req).execute().use { resp ->
                when {
                    resp.code == 200 -> ApiResult.Ok(Unit)
                    resp.code == 401 -> ApiResult.Error("Wrong password")
                    resp.code == 400 -> {
                        val msg = resp.body?.string().orEmpty()
                        if (msg.contains("Auth not enabled"))
                            ApiResult.Error("Server has no password set", authDisabled = true)
                        else ApiResult.Error("Invalid request")
                    }
                    else -> ApiResult.Error("Login failed (${resp.code})")
                }
            }
        } catch (e: IOException) {
            ApiResult.Error("Cannot reach server")
        }
    }

    suspend fun dashboard(): ApiResult<Dashboard> = getJson("/api/dashboard", Dashboard.serializer())

    suspend fun updates(
        priority: String? = null,
        sourceId: Int? = null,
        unreadOnly: Boolean = false,
        window: String? = null,
        limit: Int = 100,
        offset: Int = 0,
    ): ApiResult<UpdatesPage> {
        val sb = StringBuilder()
        fun put(k: String, v: String) {
            sb.append(if (sb.isEmpty()) '?' else '&').append("$k=").append(v)
        }
        priority?.let { put("priority", it) }
        sourceId?.let { put("source_id", it.toString()) }
        if (unreadOnly) put("unreadOnly", "1")
        window?.let { put("window", it) }
        put("limit", limit.toString())
        if (offset > 0) put("offset", offset.toString())
        return getJson("/api/updates$sb", UpdatesPage.serializer())
    }

    suspend fun sources(type: String? = null): ApiResult<List<Source>> {
        val path = "/api/sources" + (type?.takeIf { it.isNotBlank() }?.let { "?type=$it" } ?: "")
        val r = getRaw(path)
        return when (r) {
            is ApiResult.Error -> r
            is ApiResult.Ok -> try {
                val arr = json.parseToJsonElement(r.value).jsonArray
                    ?: return ApiResult.Error("Unexpected response from server")
                ApiResult.Ok(arr.map { json.decodeFromJsonElement(Source.serializer(), it) })
            } catch (e: Exception) {
                ApiResult.Error("Unexpected response from server")
            }
        }
    }

    /** POST /api/sources — creates a source and returns its new id. */
    suspend fun addSource(
        type: String,
        url: String,
        name: String = "",
        checkIntervalHours: Int = 6,
    ): ApiResult<Int> = withContext(Dispatchers.IO) {
        val body = CreateSourceBody(
            type = type,
            url = url.trim(),
            name = name.trim(),
            check_interval_hours = checkIntervalHours,
        )
        val req = Request.Builder()
            .url("$base/api/sources")
            .post(json.encodeToString(body).toRequestBody(JSON))
            .build()
        try {
            client.newCall(req).execute().use { resp ->
                val respBody = resp.body?.string().orEmpty()
                if (resp.code in 300..399 && resp.header("Location").orEmpty().contains("/login")) {
                    return@use ApiResult.Error("Session expired", needsAuth = true)
                }
                val created = try {
                    json.decodeFromJsonElement(CreatedSource.serializer(), json.parseToJsonElement(respBody))
                } catch (e: Exception) {
                    null
                }
                if (resp.code == 201 && created?.id != null) {
                    ApiResult.Ok(created.id)
                } else {
                    ApiResult.Error(created?.error ?: "Server error (${resp.code})")
                }
            }
        } catch (e: IOException) {
            ApiResult.Error("Network error — is the server reachable?")
        }
    }

    suspend fun markRead(ids: List<Int>, read: Boolean = true): ApiResult<Unit> {
        val payload = json.encodeToString(MarkBody(ids, read))
        return post("/api/updates", payload)
    }

    suspend fun deleteUpdate(id: Int): ApiResult<Unit> = delete("/api/updates/$id")

    /** Raw HTML of a snapshot version — render in a sandboxed WebView. */
    suspend fun snapshotHtml(sourceId: Int, version: Int): ApiResult<String> =
        getRaw("/api/sources/$sourceId/snapshots?version=$version")

    /** GET /api/sources/:id — source row + its snapshot versions. */
    suspend fun sourceDetail(id: Int): ApiResult<SourceDetail> =
        getJson("/api/sources/$id", SourceDetail.serializer())

    /** POST /api/sources/:id/check — run the checker for this source now. */
    suspend fun checkSource(id: Int): ApiResult<CheckResult> = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("$base/api/sources/$id/check")
            .post("{}".toRequestBody(JSON))
            .build()
        try {
            checkClient.newCall(req).execute().use { resp ->
                if (resp.code in 300..399 && resp.header("Location").orEmpty().contains("/login")) {
                    return@use ApiResult.Error("Session expired", needsAuth = true)
                }
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) return@use ApiResult.Error("Server error (${resp.code})")
                try {
                    ApiResult.Ok(
                        json.decodeFromJsonElement(CheckResult.serializer(), json.parseToJsonElement(body))
                    )
                } catch (e: Exception) {
                    ApiResult.Error("Unexpected response from server")
                }
            }
        } catch (e: IOException) {
            ApiResult.Error("Network error — is the server reachable?")
        }
    }

    /** POST /api/sources/check-all — start a background "check all" run. */
    suspend fun checkAll(): ApiResult<CheckAllStarted> = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("$base/api/sources/check-all")
            .post("{}".toRequestBody(JSON))
            .build()
        try {
            client.newCall(req).execute().use { resp ->
                if (resp.code in 300..399 && resp.header("Location").orEmpty().contains("/login")) {
                    return@use ApiResult.Error("Session expired", needsAuth = true)
                }
                val body = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) return@use ApiResult.Error("Server error (${resp.code})")
                try {
                    ApiResult.Ok(
                        json.decodeFromJsonElement(CheckAllStarted.serializer(), json.parseToJsonElement(body))
                    )
                } catch (e: Exception) {
                    ApiResult.Error("Unexpected response from server")
                }
            }
        } catch (e: IOException) {
            ApiResult.Error("Network error — is the server reachable?")
        }
    }

    /** GET /api/sources/check-all?run=0 — live progress of a running check-all. */
    suspend fun checkAllProgress(): ApiResult<CheckAllProgress> =
        getJson("/api/sources/check-all?run=0", CheckAllProgress.serializer())

    /** DELETE /api/sources/:id — remove the source and its snapshots. */
    suspend fun deleteSource(id: Int): ApiResult<Unit> = delete("/api/sources/$id")

    /** PATCH /api/sources/:id with a partial JSON body. */
    suspend fun patchSource(id: Int, body: String): ApiResult<Unit> =
        patch("/api/sources/$id", body)

    /**
     * Mark every update for a source as read. The server has no bulk source_id
     * endpoint, so fetch the unread ids and POST them (the web UI does the same
     * two-step in mark-all.tsx).
     */
    suspend fun markAllReadForSource(sourceId: Int): ApiResult<Unit> {
        when (
            val r = getJson("/api/updates?source_id=$sourceId&unreadOnly=1&limit=500", UpdatesPage.serializer())
        ) {
            is ApiResult.Error -> return r
            is ApiResult.Ok -> {
                val ids = r.value.updates.map { it.id }
                if (ids.isEmpty()) return ApiResult.Ok(Unit)
                return markRead(ids, true)
            }
        }
    }

    /** Persist the editor's rule list as the source's rules_json (PATCH). */
    suspend fun saveRules(id: Int, type: String, rules: List<WatchRule>): ApiResult<Unit> {
        val cleaned = rules.map { r ->
            val srcs = r.sources.filter { it.isNotBlank() }
            r.copy(
                keywords = r.keywords.filter { it.isNotBlank() },
                labels = r.labels.filter { it.isNotBlank() },
                negate = r.negate.filter { it.isNotBlank() },
                sources = srcs.ifEmpty { defaultSourcesFor(type) },
            )
        }.filter { !it.isBlank }
        val arr = buildJsonArray {
            cleaned.forEach { r ->
                add(
                    buildJsonObject {
                        put("type", JsonPrimitive(r.type))
                        r.priority?.takeIf { it.isNotBlank() }?.let { put("priority", JsonPrimitive(it)) }
                        put("keywords", buildJsonArray { r.keywords.forEach { add(JsonPrimitive(it)) } })
                        put("sources", buildJsonArray { r.sources.forEach { add(JsonPrimitive(it)) } })
                        put("negate", buildJsonArray { r.negate.forEach { add(JsonPrimitive(it)) } })
                        put("labels", buildJsonArray { r.labels.forEach { add(JsonPrimitive(it)) } })
                    },
                )
            }
        }
        val body = buildJsonObject { put("rules_json", JsonPrimitive(arr.toString())) }
        return patch("/api/sources/$id", body.toString())
    }

    /** GET /api/search — FTS5 over updates + substring over project fields. */
    suspend fun search(query: String): ApiResult<SearchPage> {
        val q = java.net.URLEncoder.encode(query.trim(), "UTF-8")
        return getJson("/api/search?q=$q", SearchPage.serializer())
    }

    private suspend fun <T> getJson(
        path: String,
        deserializer: kotlinx.serialization.DeserializationStrategy<T>,
    ): ApiResult<T> {
        val r = getRaw(path)
        return when (r) {
            is ApiResult.Error -> r
            is ApiResult.Ok -> try {
                ApiResult.Ok(json.decodeFromJsonElement(deserializer, json.parseToJsonElement(r.value)))
            } catch (e: Exception) {
                ApiResult.Error("Unexpected response from server")
            }
        }
    }

    private suspend fun getRaw(path: String): ApiResult<String> = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(base + path).build()
        try {
            client.newCall(req).execute().use { resp ->
                if (resp.code in 300..399 && resp.header("Location").orEmpty().contains("/login")) {
                    return@use ApiResult.Error("Session expired", needsAuth = true)
                }
                if (!resp.isSuccessful) return@use ApiResult.Error("Server error (${resp.code})")
                val body = resp.body?.string() ?: return@use ApiResult.Error("Empty response")
                // A JSON endpoint answering with HTML means we were bounced
                // to /login (auth gate). Snapshot pages are legitimately HTML.
                val isSnapshot = path.contains("snapshots?version")
                if (!isSnapshot && body.trimStart().startsWith("<")) {
                    return@use ApiResult.Error("Authentication required", needsAuth = true)
                }
                ApiResult.Ok(body)
            }
        } catch (e: IOException) {
            ApiResult.Error("Network error — is the server reachable?")
        }
    }

    private suspend fun post(path: String, payload: String): ApiResult<Unit> = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(base + path)
            .post(payload.toRequestBody(JSON))
            .build()
        try {
            client.newCall(req).execute().use { resp ->
                if (resp.code in 300..399 && resp.header("Location").orEmpty().contains("/login")) {
                    return@use ApiResult.Error("Session expired", needsAuth = true)
                }
                if (resp.isSuccessful) ApiResult.Ok(Unit) else ApiResult.Error("Server error (${resp.code})")
            }
        } catch (e: IOException) {
            ApiResult.Error("Network error")
        }
    }

    private suspend fun delete(path: String): ApiResult<Unit> = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(base + path).delete().build()
        try {
            client.newCall(req).execute().use { resp ->
                if (resp.isSuccessful) ApiResult.Ok(Unit) else ApiResult.Error("Server error (${resp.code})")
            }
        } catch (e: IOException) {
            ApiResult.Error("Network error")
        }
    }

    /** PATCH a partial JSON body (archive flag, rules_json, …). */
    private suspend fun patch(path: String, payload: String): ApiResult<Unit> =
        withContext(Dispatchers.IO) {
            val req = Request.Builder()
                .url(base + path)
                .patch(payload.toRequestBody(JSON))
                .build()
            try {
                client.newCall(req).execute().use { resp ->
                    if (resp.code in 300..399 && resp.header("Location").orEmpty().contains("/login")) {
                        return@use ApiResult.Error("Session expired", needsAuth = true)
                    }
                    if (resp.isSuccessful) ApiResult.Ok(Unit) else ApiResult.Error("Server error (${resp.code})")
                }
            } catch (e: IOException) {
                ApiResult.Error("Network error")
            }
        }

    /** Which snapshot fields a rule's keywords are searched in, by source type. */
    private fun defaultSourcesFor(type: String): List<String> = when (type) {
        "github" -> listOf("releases", "readme", "commits")
        "rss" -> listOf("feed")
        else -> listOf("content")
    }

    /**
     * GET /api/sources/:id/logo → the stored project logo (GitHub repo
     * avatar) as PNG bytes, or null when the source has none or the file is
     * missing. Uses the authenticated client so the session cookie is sent.
     */
    suspend fun logo(sourceId: Int): ByteArray? = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("$base/api/sources/$sourceId/logo").build()
        try {
            client.newCall(req).execute().use { resp ->
                if (resp.isSuccessful) resp.body?.bytes() else null
            }
        } catch (e: IOException) {
            null
        }
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
    }
}

@kotlinx.serialization.Serializable
private data class LoginBody(val password: String)

@kotlinx.serialization.Serializable
private data class MarkBody(val ids: List<Int>, val read: Boolean)

@kotlinx.serialization.Serializable
private data class CreateSourceBody(
    val type: String,
    val url: String,
    val name: String,
    val check_interval_hours: Int,
)

@kotlinx.serialization.Serializable
private data class CreatedSource(
    val id: Int? = null,
    val error: String? = null,
)
