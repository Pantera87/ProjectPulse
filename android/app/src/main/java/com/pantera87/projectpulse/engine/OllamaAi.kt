package com.pantera87.projectpulse.engine

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.concurrent.Volatile

/**
 * LAN Ollama provider (Phase 5, option B) — talks to an Ollama server on the
 * local network so on-device checks get real AI summaries/goals. Port of the
 * server's Ollama provider (src/lib/ai.ts `OllamaProvider`): same prompts,
 * same `/api/generate` endpoint, same `/no_think` switch for Qwen3 models,
 * same "one JSON object" output contract.
 *
 * Every failure degrades to null (the checkers keep their heuristics, exactly
 * as with AI off), and every attempt is recorded in [LanOllamaAi.lastCall] —
 * the port of the server's ai-activity/ai-status line (last-call status +
 * latency) that the Settings screen shows. The 120 s read timeout bounds each
 * call so a slow model never wedges a check run.
 */
class LanOllamaAi(url: String, private val model: String) : EngineAi {

    /** One recorded AI call: "ok"/"error", message, latency, timestamp. */
    class Snapshot(
        val status: String?,
        val error: String?,
        val latencyMs: Long?,
        val at: Long?,
    )

    companion object {
        /**
         * The engine's AI activity line: the result of the most recent real
         * call — "ok" / "error", its message and how long it took.
         * null = no AI call has happened yet this process run.
         */
        @Volatile
        var lastCall: Snapshot? = null
            private set

        private fun record(ok: Boolean, error: String?, latencyMs: Long) {
            lastCall = Snapshot(if (ok) "ok" else "error", error, latencyMs, System.currentTimeMillis())
        }
    }

    private val baseUrl: String = url.trim().removeSuffix("/")
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    // Qwen3 "thinking" models burn the token budget on chain-of-thought and
    // reply with empty content; the `/no_think` soft switch turns reasoning
    // off (mirrors the server's noThink handling for qwen3 models).
    private val noThink: Boolean = Regex("qwen3", RegexOption.IGNORE_CASE).containsMatchIn(model)

    /** Prompt suffix that disables Qwen3 reasoning (server parity). */
    private val promptSuffix: String get() = if (noThink) " /no_think" else ""

    override val enabled: Boolean get() = true

    /** One chat completion against `POST /api/generate`; null on any failure. */
    private suspend fun complete(prompt: String, maxTokens: Int = 300): String? =
        withContext(Dispatchers.IO) {
            val body = buildString {
                append("{\"model\":")
                append(escapedJson(model))
                append(",\"prompt\":")
                append(escapedJson(prompt + promptSuffix))
                append(",\"stream\":false")
                append(",\"options\":{\"temperature\":0.1,\"num_predict\":")
                append(maxTokens)
                append("}}")
            }.toRequestBody("application/json".toMediaType())
            val req = Request.Builder().url("$baseUrl/api/generate").post(body).build()
            val t0 = System.currentTimeMillis()
            try {
                client.newCall(req).execute().use { res ->
                    if (!res.isSuccessful) {
                        val detail = runCatching { res.body?.string()?.trim()?.take(300) }.getOrNull()
                        val msg = "Ollama returned HTTP ${res.code}" + (detail?.let { ": $it" } ?: "")
                        record(false, msg, System.currentTimeMillis() - t0)
                        return@withContext null
                    }
                    val json = res.body?.string() ?: return@withContext null
                    val reply = jsonStringField(json, "response") ?: ""
                    val out = stripThinkingBlocks(reply)
                    if (out.isBlank()) {
                        record(false, "Empty reply from Ollama (model $model)", System.currentTimeMillis() - t0)
                        null
                    } else {
                        record(true, null, System.currentTimeMillis() - t0)
                        out
                    }
                }
            } catch (e: IOException) {
                record(false, e.message ?: "network error", System.currentTimeMillis() - t0)
                null
            }
        }

    // -- EngineAi ----------------------------------------------------------

    override suspend fun summarizeUpdate(text: String, context: String): UpdateSummary? {
        val t = if (text.length > 4000) text.take(4000) else text
        val out = complete(
            "Summarize the following $context update in 1-3 short, plain sentences " +
                "for a developer who follows this project. Keep only the major changes, " +
                "most important first; omit trivial or routine items. " +
                "Classify the overall importance as exactly one of: critical (major version, " +
                "breaking changes, security issue), high (significant new feature or fix), " +
                "normal (routine or minor change). " +
                "Reply with ONLY a JSON object like {\"summary\": \"...\", \"priority\": \"...\"}.\n\n" +
                "Update:\n$t",
            maxTokens = 300,
        ) ?: return null
        val json = extractJsonObject(out) ?: return null
        val summary = jsonStringField(json, "summary")?.trim() ?: return null
        val priority = normalizePriority(jsonStringField(json, "priority")) ?: "normal"
        return UpdateSummary(summary = summary, priority = priority)
    }

    override suspend fun extractGoal(htmlText: String): String? {
        val t = if (htmlText.length > 3000) htmlText.take(3000) else htmlText
        val out = complete(
            "Look at the following text describing a software project (its homepage, " +
                "README or release notes). In ONE line of plain prose (max ~140 characters, " +
                "no quotes, no trailing period), state what the project is for. " +
                "If the text does not say what the project is, reply exactly: none\n\n" +
                "Text:\n$t",
            maxTokens = 40,
        ) ?: return null
        val cleaned = out.trim().trim('"').trim('`')
        if (cleaned.equals("none", ignoreCase = true) || cleaned.isBlank()) return null
        return if (cleaned.length > 140) null else cleaned
    }

    override suspend fun semanticMatch(text: String, keywords: List<String>): SemanticMatch? {
        val t = if (text.length > 3000) text.take(3000) else text
        val out = complete(
            "Keywords the user cares about: ${keywords.joinToString(", ")}. " +
                "Does the text below really RELATE to any of those keywords — same topic, not " +
                "just a word overlap? If yes, pick the keyword it most relates to and judge its " +
                "relevance: critical = direct & significant development about that topic, " +
                "high = clearly related, normal = tangential. Reply with ONLY a JSON object like " +
                "{\"match\": true, \"topic\": \"the keyword\", \"summary\": \"one sentence\", " +
                "\"priority\": \"critical|high|normal\"}. If it does not really relate to any " +
                "keyword, reply {\"match\": false}.\n\nText:\n$t",
            maxTokens = 200,
        ) ?: return null
        val json = extractJsonObject(out) ?: return null
        val match = jsonStringField(json, "match")?.trim()?.lowercase()?.toBoolean() ?: return null
        if (!match) return SemanticMatch(match = false, topic = "", summary = "", priority = "normal")
        val topic = jsonStringField(json, "topic")?.take(80) ?: ""
        val summary = jsonStringField(json, "summary")?.trim().orEmpty()
        val priority = normalizePriority(jsonStringField(json, "priority")) ?: "normal"
        return SemanticMatch(match = true, topic = topic, summary = summary, priority = priority)
    }

    /**
     * Tiny end-to-end probe for the Settings "Test" button: asks the model
     * for a short reply. Null when the endpoint or model is unusable.
     */
    suspend fun ping(): String? = complete("Reply with the single word: ok", maxTokens = 16)

    // -- reply parsing ----------------------------------------------------

    /** True when [raw] names one of the three known priorities. */
    private fun normalizePriority(raw: String?): String? = when (raw?.trim()?.lowercase()) {
        "critical" -> "critical"
        "high" -> "high"
        "normal" -> "normal"
        else -> null
    }

    /** First JSON object span in the model's reply, or null. */
    private fun extractJsonObject(out: String): String? {
        val s = out.indexOf('{')
        val e = out.lastIndexOf('}')
        if (s < 0 || e <= s) return null
        return out.substring(s, e + 1)
    }

    /** Best-effort extraction of a scalar JSON field (string or bare literal). */
    private fun jsonStringField(json: String, key: String): String? {
        val m = Regex(""""$key"\s*:\s*(?:""((?:[^"\\]|\\.)*)""|\s*([a-zA-Z0-9._\-]+)\s*[,}])""").find(json)
            ?: return null
        val group = m.groupValues[1].ifEmpty { m.groupValues[2] }
        return group
            .replace("\\n", "\n")
            .replace("\\t", "\t")
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
    }

    /**
     * Some Ollama versions return a thinking model's reasoning inline before
     * the answer; drop the leading "Thinking:" preamble so the JSON parsing
     * sees only the payload (port of the server's `stripThinkingBlocks`).
     */
    private fun stripThinkingBlocks(text: String): String {
        if (!text.contains("Thinking:", ignoreCase = true)) return text
        return text
            .lineSequence()
            .dropWhile { it.trim().lowercase().startsWith("thinking:") || it.isBlank() }
            .joinToString("\n")
    }
}

/**
 * Builds a JSON string literal without a JSON library (the engine layer has
 * none on the class path): escapes backslash, quote and control characters.
 */
internal fun escapedJson(s: String): String = buildString(s.length + 8) {
    append('"')
    for (c in s) {
        when (c) {
            '\\' -> append("\\\\")
            '"' -> append("\\\"")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            '\u0000' -> append("\\u0000")
            else -> append(c)
        }
    }
    append('"')
}