package com.pantera87.projectpulse.engine

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Port of src/lib/http.ts — plain HTTP for the on-device engine (external
 * pages, feeds, GitHub assets), with the same UA / timeout / size-cap
 * semantics. OkHttp (already used by the remote API client) is the transport.
 */

/** Same browser-like UA the server uses for page/feed fetches. */
internal const val ENGINE_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 ProjectPulse/1.0"

internal val http: OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .followRedirects(true)
    .followSslRedirects(true)
    .build()

/** Fetch options (mirrors `HttpOpts` in src/lib/http.ts). */
data class FetchOpts(
    val timeoutMs: Long = 30_000,
    val headers: Map<String, String> = emptyMap(),
    val maxBytes: Long = 5_000_000,
)

/**
 * Fetches a URL as UTF-8 text. Throws `IOException("HTTP <status> for <url>")`
 * on non-2xx (the checkers key off the 404 in the message, as on the server).
 */
suspend fun fetchText(url: String, opts: FetchOpts = FetchOpts()): String = withContext(Dispatchers.IO) {
    val client = if (opts.timeoutMs > 30_000) {
        http.newBuilder().readTimeout(opts.timeoutMs, TimeUnit.MILLISECONDS).build()
    } else {
        http
    }
    val req = Request.Builder()
        .url(url)
        .header("user-agent", ENGINE_UA)
        .header("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .apply { opts.headers.forEach { (k, v) -> header(k, v) } }
        .build()
    client.newCall(req).execute().use { res ->
        if (!res.isSuccessful) throw IOException("HTTP ${res.code} for $url")
        res.body?.string()?.let { if (it.length > opts.maxBytes) it.take(opts.maxBytes.toInt()) else it } ?: ""
    }
}

/**
 * Fetches a URL as bytes (best-effort; null on any failure or size overflow).
 * Used for project logos — mirrors the server's `fetchBinary` helper.
 */
suspend fun fetchBinary(url: String, timeoutMs: Long = 10_000, maxBytes: Int = 2 * 1024 * 1024): ByteArray? =
    withContext(Dispatchers.IO) {
        try {
            val client = if (timeoutMs > 30_000) {
                http.newBuilder().readTimeout(timeoutMs, TimeUnit.MILLISECONDS).build()
            } else {
                http
            }
            val req = Request.Builder().url(url).header("user-agent", ENGINE_UA).header("accept", "*/*").build()
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return@use null
                val bytes = res.body?.bytes() ?: return@use null
                if (bytes.isNotEmpty() && bytes.size <= maxBytes) bytes else null
            }
        } catch (e: Exception) {
            null
        }
    }

/**
 * Downloads a URL to a local file (best-effort; used to cache raw pages).
 * Returns true on success.
 */
suspend fun downloadFile(url: String, file: File): Boolean = withContext(Dispatchers.IO) {
    try {
        val req = Request.Builder().url(url).header("user-agent", ENGINE_UA).build()
        http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) return@use false
            val bytes = res.body?.bytes() ?: return@use false
            file.parentFile?.mkdirs()
            file.writeBytes(bytes)
            true
        }
    } catch (e: Exception) {
        false
    }
}
