package com.pantera87.projectpulse.engine

import android.util.Base64
import com.pantera87.projectpulse.data.db.MetaDao
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Port of src/lib/github.ts — the GitHub API client with the same
 * concurrency / rate-limit guards:
 *  - max [MAX_INFLIGHT] in-flight requests, [MIN_SPACING_MS] ms spacing;
 *  - on 403/429 rate-limit responses: honor Retry-After /
 *    X-RateLimit-Reset, else exponential backoff, up to [MAX_RETRIES];
 *  - when the per-window budget (X-RateLimit-Remaining) hits 0, wait for the
 *    reset instead of hammering.
 * The token is read from the local `meta` table (`github_token`) so the
 * Settings screen's saved token is used.
 */

// --- API response shapes (only the fields the checkers read) ---

@Serializable
data class GhOwner(val login: String = "", val avatar_url: String = "")

@Serializable
data class GhRepo(
    val full_name: String = "",
    val description: String? = null,
    val topics: List<String> = emptyList(),
    val pushed_at: String = "",
    val archived: Boolean = false,
    val stargazers_count: Int = 0,
    val owner: GhOwner = GhOwner(),
)

@Serializable
data class GhRelease(
    val id: Long = 0,
    val tag_name: String = "",
    val name: String? = null,
    val body: String? = null,
    val prerelease: Boolean = false,
    val published_at: String = "",
    val html_url: String = "",
)

@Serializable
data class GhMilestone(
    val id: Long = 0,
    val title: String = "",
    val state: String = "",
    val due_on: String? = null,
    val closed_issues: Int = 0,
    val open_issues: Int = 0,
    val html_url: String = "",
)

@Serializable
data class GhLabel(val name: String = "")

@Serializable
data class GhIssue(
    val number: Long = 0,
    val title: String = "",
    val state: String = "",
    val labels: List<GhLabel> = emptyList(),
    val html_url: String = "",
    val created_at: String = "",
    val body: String? = null,
)

@Serializable
data class GhCommitAuthor(val name: String? = null)

@Serializable
data class GhCommitMeta(val message: String = "", val author: GhCommitAuthor? = null)

@Serializable
data class GhCommit(
    val sha: String = "",
    val commit: GhCommitMeta = GhCommitMeta(),
    val html_url: String = "",
)

/** README info: decoded markdown text + the rendered HTML page URL. */
data class ReadmeInfo(val text: String, val htmlUrl: String?)

/** Parses `https://github.com/owner/repo` (or `owner/repo`) → (owner, repo). */
fun parseGithubRef(input: String): Pair<String, String>? {
    val s = input.trim()
    Regex("github\\.com[/:]([^/]+)/([^/#?]+)", RegexOption.IGNORE_CASE).find(s)?.let {
        return it.groupValues[1] to it.groupValues[2].removeSuffix(".git")
    }
    if (Regex("^[\\w.-]+/[\\w.-]+$").matches(s)) {
        val parts = s.split("/")
        return parts[0] to parts[1]
    }
    return null
}

object EngineGithub {
    private const val API = "https://api.github.com"
    private const val MAX_INFLIGHT = 5
    private const val MIN_SPACING_MS = 150L
    private const val MAX_RETRIES = 3
    private const val SECONDARY_WAIT_MS = 60_000L
    private const val RESET_BUFFER_MS = 2_000L

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private class Budget {
        var token: String? = null
        var limit: Int? = null
        var remaining: Int? = null
        var reset: Long? = null
    }

    private val budget = Budget()
    private val lock = Any()
    private var inflight = 0
    private var lastStart = 0L

    /** Set once by the host (LocalBackend/Engine) with the app's MetaDao. */
    lateinit var metaDao: MetaDao
        private set

    fun init(metaDao: MetaDao) {
        if (!this::metaDao.isInitialized) this.metaDao = metaDao
    }

    private suspend fun token(): String? =
        try {
            metaDao.getValue("github_token")?.trim()?.takeIf { it.isNotEmpty() }
        } catch (e: Exception) {
            null
        }

    private fun updateBudget(h: Headers, t: String?) {
        if (budget.token != t) {
            budget.token = t
            budget.limit = null
            budget.remaining = null
            budget.reset = null
        }
        h["x-ratelimit-limit"]?.toIntOrNull()?.let { budget.limit = it }
        h["x-ratelimit-remaining"]?.toIntOrNull()?.let { budget.remaining = it }
        h["x-ratelimit-reset"]?.toLongOrNull()?.let { budget.reset = it }
    }

    private suspend fun budgetGate(t: String?) {
        if (budget.token != t) return
        val remaining = budget.remaining ?: return
        val reset = budget.reset ?: return
        if (remaining <= 0) {
            val until = reset * 1000 + RESET_BUFFER_MS - System.currentTimeMillis()
            if (until > 0) delay(until)
        }
    }

    /** Serial tail: spacing + budget wait, then acquire a concurrency slot. */
    private suspend fun acquireSlot() {
        while (true) {
            var gap = -1L
            synchronized(lock) {
                if (inflight < MAX_INFLIGHT) {
                    gap = (lastStart + MIN_SPACING_MS - System.currentTimeMillis()).coerceAtLeast(0)
                }
            }
            if (gap < 0) {
                delay(100)
                continue
            }
            // Spacing + budget waits suspend, so they run outside the lock.
            if (gap > 0) delay(gap)
            budgetGate(token())
            synchronized(lock) {
                lastStart = System.currentTimeMillis()
                inflight++
            }
            return
        }
    }

    private fun releaseSlot() {
        synchronized(lock) { inflight = (inflight - 1).coerceAtLeast(0) }
    }

    private suspend fun isRateLimited(res: Response): Boolean {
        if (res.code == 429) return true
        if (res.headers["retry-after"] != null) return true
        if (res.headers["x-ratelimit-remaining"] == "0") return true
        val body = runCatching { res.body?.string() ?: "" }.getOrDefault("")
        return Regex("rate limit|abuse", RegexOption.IGNORE_CASE).containsMatchIn(body)
    }

    private fun rateLimitWaitMs(h: Headers, attempt: Int): Long {
        val retryAfter = h["retry-after"]?.toLongOrNull()
        if (retryAfter != null && retryAfter > 0) return retryAfter * 1000
        val reset = h["x-ratelimit-reset"]?.toLongOrNull()
        if (h["x-ratelimit-remaining"] == "0" && (reset ?: 0L) > 0) {
            return (reset!! * 1000 - System.currentTimeMillis()).coerceAtLeast(0) + RESET_BUFFER_MS
        }
        return SECONDARY_WAIT_MS * (2L shl attempt)
    }

    /**
     * Executes one API GET with the rate-limit/retry guard. Returns an open
     * [Response] on success (the caller closes it). Throws [IOException] with
     * `"GitHub API <code> for <path>"` on other non-2xx, and a descriptive
     * error when rate-limit retries are exhausted.
     */
    private suspend fun ghFetch(path: String, accept: String): Response {
        val token = token()
        val headers = Headers.Builder().apply {
            add("accept", accept)
            add("user-agent", "ProjectPulse")
            add("x-github-api-version", "2022-11-28")
            if (token != null) add("authorization", "Bearer $token")
        }.build()
        var attempt = 0
        while (true) {
            acquireSlot()
            val res: Response =
                try {
                    val req = Request.Builder().url("$API$path").headers(headers).build()
                    client.newCall(req).execute()
                } finally {
                    releaseSlot()
                }
            updateBudget(res.headers, token)
            if ((res.code == 403 || res.code == 429) && isRateLimited(res)) {
                if (attempt < MAX_RETRIES) {
                    val waitMs = rateLimitWaitMs(res.headers, attempt)
                    attempt++
                    res.close()
                    delay(waitMs)
                    continue
                }
                res.close()
                throw Exception(
                    if (token != null) {
                        "GitHub rate limit reached — retries exhausted until the rate-limit window resets"
                    } else {
                        "GitHub rate limit reached (60 req/h unauthenticated) — add a GitHub token in Settings → GitHub for 5,000 req/h"
                    }
                )
            }
            if (!res.isSuccessful) {
                val msg = "GitHub API ${res.code} for $path"
                res.close()
                throw IOException(msg)
            }
            return res
        }
    }

    private suspend fun <T> gh(path: String, deserializer: (String) -> T): T {
        val res = ghFetch(path, "application/vnd.github+json")
        return try {
            deserializer(res.body?.string() ?: "")
        } finally {
            res.close()
        }
    }

    suspend fun repo(owner: String, repo: String): GhRepo =
        gh("/repos/$owner/$repo") { json.decodeFromString(GhRepo.serializer(), it) }

    suspend fun releases(owner: String, repo: String, perPage: Int = 10): List<GhRelease> =
        gh("/repos/$owner/$repo/releases?per_page=$perPage") {
            json.parseToJsonElement(it).jsonArray.map { el ->
                json.decodeFromJsonElement(GhRelease.serializer(), el)
            }
        }

    /** Raw README markdown, or null if the repo has no README (404). */
    suspend fun readme(owner: String, repo: String): String? =
        try {
            ghFetch("/repos/$owner/$repo/readme", "application/vnd.github.raw+json").use {
                it.body?.string()
            }
        } catch (e: Exception) {
            null
        }

    /** Decoded README markdown + rendered HTML URL (base64 `content` field). */
    suspend fun readmeInfo(owner: String, repo: String): ReadmeInfo? =
        try {
            gh("/repos/$owner/$repo/readme") { body ->
                val obj = json.parseToJsonElement(body).jsonObject
                val content = obj["content"]?.jsonPrimitive?.contentOrNull
                if (content != null) {
                    val text = String(Base64.decode(content, Base64.DEFAULT), Charsets.UTF_8)
                    ReadmeInfo(text, obj["html_url"]?.jsonPrimitive?.contentOrNull)
                } else {
                    null
                }
            }
        } catch (e: Exception) {
            null
        }

    suspend fun milestones(owner: String, repo: String): List<GhMilestone> =
        gh("/repos/$owner/$repo/milestones") {
            json.parseToJsonElement(it).jsonArray.map { el ->
                json.decodeFromJsonElement(GhMilestone.serializer(), el)
            }
        }

    suspend fun issues(owner: String, repo: String, labels: String): List<GhIssue> =
        gh("/repos/$owner/$repo/issues?labels=$labels") {
            json.parseToJsonElement(it).jsonArray.map { el ->
                json.decodeFromJsonElement(GhIssue.serializer(), el)
            }
        }

    suspend fun commits(owner: String, repo: String, perPage: Int = 30): List<GhCommit> =
        gh("/repos/$owner/$repo/commits?per_page=$perPage") {
            json.parseToJsonElement(it).jsonArray.map { el ->
                json.decodeFromJsonElement(GhCommit.serializer(), el)
            }
        }
}
