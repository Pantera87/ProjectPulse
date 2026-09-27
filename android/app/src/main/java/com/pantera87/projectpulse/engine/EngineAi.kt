package com.pantera87.projectpulse.engine

import kotlinx.serialization.Serializable

/**
 * Result of one AI update-summary / importance-classification call.
 * Mirrors `UpdateSummary` in src/lib/ai.ts.
 */
@Serializable
data class UpdateSummary(val summary: String, val priority: String)

/**
 * Structured result of one AI semantic topic-match pass.
 * Mirrors `SemanticMatch` in src/lib/ai.ts.
 */
@Serializable
data class SemanticMatch(
    val match: Boolean,
    val topic: String,
    val summary: String,
    val priority: String,
)

/**
 * AI seam for the local engine. The server's AI providers (Ollama, OpenAI,
 * Anthropic, MCP) are server-side only; on-device, [LocalAi] (AI off) keeps
 * the checker code structurally identical to the server port, and every AI
 * feature degrades to its heuristic fallback exactly as the server does when
 * AI is disabled.
 */
interface EngineAi {
    val enabled: Boolean
    suspend fun summarizeUpdate(text: String, context: String): UpdateSummary?
    suspend fun extractGoal(htmlText: String): String?
    suspend fun semanticMatch(text: String, keywords: List<String>): SemanticMatch?
}

/** AI-off provider: every call returns null; callers keep their heuristics. */
object LocalAi : EngineAi {
    override val enabled: Boolean get() = false
    override suspend fun summarizeUpdate(text: String, context: String): UpdateSummary? = null
    override suspend fun extractGoal(htmlText: String): String? = null
    override suspend fun semanticMatch(text: String, keywords: List<String>): SemanticMatch? = null
}

/** The engine's AI provider. Swap for a real on-device provider later. */
val ai: EngineAi get() = LocalAi
