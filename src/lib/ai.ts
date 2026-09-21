/**
 * AI provider seam.
 *
 * Providers (selected in Settings or via env):
 *   - Ollama: local models (qwen3.5:4b default); the model is loaded
 *     on first use and auto-downloaded when AI is requested without it.
 *   - OpenAI-compatible: any /v1/chat/completions endpoint (OpenAI, LM
 *     Studio, vLLM, Ollama's /v1, gateways…).
 *   - Anthropic: Claude via the Messages API.
 *   - MCP: a remote MCP server (e.g. on another machine running local AI).
 *
 * Default with no config is the no-op NullProvider: every method returns
 * null and callers fall back to heuristics. AI_ENABLED=false is a hard
 * kill-switch that overrides the Settings toggle.
 */
import { existsSync } from "node:fs";
import { getDb, getSetting, setSetting } from "./db";
import type { Priority } from "./db";
import {
  DEFAULT_OLLAMA_MODEL,
  defaultOllamaUrl,
  getPullJobs,
  ollamaInstalled,
  ollamaSnapshot,
  ollamaVersion,
  startPull,
  normalizeOllamaModel,
  type OllamaSnapshot,
  type PullJob,
} from "./ollama";
import { aiActivity, recordAIResult, trackAIWork } from "./ai-activity";
import { GLYPH_NAMES } from "./glyphs.generated";

export type ProviderKind = "ollama" | "openai" | "anthropic" | "mcp";

/**
 * A document handed to the provider alongside the prompt. Ollama (≥ 0.6.2)
 * uses its built-in RAG: the server chunks, embeds and retrieves from the
 * files so the model only sees the most relevant parts. Providers without
 * RAG support ignore the docs (callers keep a truncated in-prompt copy).
 */
export interface AIDoc {
  /** File name shown to the server, e.g. "readme.md". */
  name: string;
  content: string;
}

/**
 * Structured result of the AI semantic topic-match pass.
 */
export interface SemanticMatch {
  match: boolean;
  /** The topic/keyword the text most relates to. */
  topic: string;
  /** One-sentence explanation of what in the text matches and why. */
  summary: string;
  /**
   * AI-assessed relevance of the match: critical = direct & significant
   * development about the topic, high = clearly related, normal = tangential.
   */
  priority: Priority;
}

/**
 * Result of summarizing an update: a short plain-language summary plus the
 * AI's classification of how important the change is.
 */
export interface UpdateSummary {
  /**
   * One to three short sentences describing what changed, in flowing prose
   * (never bullets or lists, so it reads well as a phone message). When the
   * content contains multiple changes, only the major ones are kept — in
   * order of importance; trivial/routine items are omitted.
   */
  summary: string;
  /**
   * AI-assessed importance of the change: critical = major version / breaking
   * change / security issue, high = significant new feature or fix,
   * normal = routine or minor change.
   */
  priority: Priority;
}

export interface AIProvider {
  readonly enabled: boolean;
  readonly kind: ProviderKind | "none";
  /** Summarize a diff/changes for a project. */
  summarize(diff: string, context: string): Promise<string | null>;
  /**
   * Summarize an update (release notes, diff, feed entry, commit message…)
   * in short plain prose AND classify its importance (critical / high /
   * normal). When the content holds multiple changes, the summary keeps
   * only the major ones, most important first (trivial items omitted).
   * null = AI unavailable / unparseable reply (callers keep their heuristic
   * summary and priority).
   */
  summarizeUpdate(text: string, context: string): Promise<UpdateSummary | null>;
  /** One-line goal/purpose of software described by text. */
  extractGoal(htmlText: string, docs?: AIDoc[]): Promise<string | null>;
  /**
   * Does this text semantically relate to any of the keywords — and if so,
   * classify the match: which topic it relates to, a one-sentence summary of
   * what in the text matches, and how important/relevant it is.
   * null = AI unavailable / unparseable reply (callers treat as no match).
   */
  semanticMatch(text: string, keywords: string[], docs?: AIDoc[]): Promise<SemanticMatch | null>;
  /**
   * Two-level classification of the project's intended use: a GENERIC
   * category (broad domain/family, e.g. "cnc") plus a specific subcategory
   * (e.g. "cnc-controller-firmware"), plus the glyph (one of the curated
   * Iconify "Glyphs" names, GLYPH_NAMES) that best represents the category.
   * null = AI unavailable / unparseable reply (callers fall back to
   * heuristics); icon = null when the model picked nothing valid.
   */
  suggestCategory(
    text: string,
    existing: string[],
    docs?: AIDoc[]
  ): Promise<{ category: string; subcategory: string | null; icon: string | null } | null>;
  /**
   * Specific subcategory (a few hyphenated words) for a project that is
   * already in a known category (e.g. "cnc" → "cnc-controller-firmware").
   * null = AI unavailable / unparseable reply.
   */
  suggestSubcategory(text: string, category: string, docs?: AIDoc[]): Promise<string | null>;

  /**
   * The single glyph (one of the curated Iconify "Glyphs" names,
   * GLYPH_NAMES) that best represents a known category — used when a category
   * is renamed by hand and the new slug has no stored icon yet.
   * null = AI unavailable / unparseable reply (the UI keeps its keyword/hash
   * fallback from category-icon.tsx).
   */
  suggestIcon(category: string, context?: string): Promise<string | null>;
  /**
   * Summarize what a whole project/software is — as a bullet list covering
   * the ENTIRE content (not just its opening). `size` controls how many
   * bullets: short = 3, medium = 6, long = 10.
   */
  summarizeProject(
    text: string,
    context: string,
    docs?: AIDoc[],
    size?: "short" | "medium" | "long"
  ): Promise<string | null>;
  /** Connectivity probe — returns the model's reply to a trivial prompt. */
  ping(): Promise<string | null>;
  /** Most recent failure reason from the provider (HTTP status, network error,
   *  …) or null when the last call succeeded / no reason is known. */
  failureInfo(): string | null;
}

/** Options for a raw completion. */
interface CompleteOpts {
  /** Max tokens the model may produce (thinking tokens included). */
  maxTokens?: number;
  /** Documents handed to the provider as RAG files (Ollama ≥ 0.6.2). */
  docs?: AIDoc[];
  /**
   * Accept only the model's FINAL answer. Thinking models (Qwen3,
   * DeepSeek…) that spend their whole token budget on internal reasoning
   * would otherwise get their chain-of-thought returned as the reply —
   * acceptable for ping and free-text prompts, but poison for callers
   * that expect structured output (slugs, JSON): a "Let me analyze this
   * project…" preamble would be slugified into a bogus category.
   */
  finalOnly?: boolean;
}

/** Shared prompt-building on top of a raw text completion. */
abstract class BaseAI implements AIProvider {
  abstract readonly kind: ProviderKind;
  abstract readonly enabled: boolean;
  protected abstract complete(prompt: string, opts?: CompleteOpts): Promise<string | null>;
  /** Whether the provider can receive RAG documents (Ollama ≥ 0.6.2 only). */
  protected get supportsDocs(): boolean {
    return false;
  }

  /**
   * Why the LAST complete() call failed (HTTP status + body snippet, network
   * error, …). Providers set it inside complete() before returning null;
   * trackedComplete() reports it to the health registry and failureInfo()
   * surfaces it to the Test button. null = last call succeeded / no reason.
   */
  protected lastError: string | null = null;

  failureInfo(): string | null {
    return this.lastError;
  }

  /**
   * In-prompt text budget: when the provider gets the full content as a RAG
   * document, only a short anchor stays in the prompt; otherwise the usual
   * (larger) truncation applies.
   */
  private clip(text: string, withDoc: number, plain: number, hasDoc: boolean): string {
    const n = this.supportsDocs && hasDoc ? withDoc : plain;
    return text.length > n ? text.slice(0, n) : text;
  }

  /** Prompt note added when the full content travels as an attached doc. */
  private docNote(hasDoc: boolean): string {
    return this.supportsDocs && hasDoc ? " The full document text is attached." : "";
  }

  /**
   * complete() with engine-health recording: a null reply means the
   * PROVIDER failed (network / HTTP / model missing / empty response) and
   * is reported to the activity registry. A non-null reply is a success
   * even when a caller's parser later finds nothing in it — "no match"
   * and "unknown" are answers, not errors.
   */
  protected async trackedComplete(prompt: string, opts?: CompleteOpts): Promise<string | null> {
    const out = await this.complete(prompt, opts);
    recordAIResult(
      out !== null,
      out === null ? (this.lastError ?? `${this.kind} provider returned no response`) : undefined
    );
    return out;
  }

  async summarize(diff: string, context: string): Promise<string | null> {
    const d = diff.length > 4000 ? diff.slice(0, 4000) : diff;
    return this.trackedComplete(
      `Summarize these changes to the project "${context}" in one or two plain sentences. No preamble.\n\n${d}`,
      { maxTokens: 500 }
    );
  }

  async summarizeUpdate(text: string, context: string): Promise<UpdateSummary | null> {
    const t = text.length > 4000 ? text.slice(0, 4000) : text;
    const out = await this.trackedComplete(
      `Below is a change to the project "${context}".\n` +
        `1) Summarize it in short prose.\n` +
        `2) Classify how important the change is.\n` +
        `Rules for the summary:\n` +
        `- Plain language a human can act on, 1-3 short sentences (max 60 words).\n` +
        `- If the content lists MULTIPLE changes, mention only the MAJOR ones, most important first, as flowing prose (e.g. "Adds X and fixes Y; also improves Z") — and omit trivial or routine items such as typo fixes, doc tweaks, chores, test-only changes and dependency bumps.\n` +
        `- NEVER use bullet points, lists, numbering or headings: the summary is shown as a short phone message.\n` +
        `Reply with ONLY a JSON object (no other text) with these keys:\n` +
        `- "summary": the summary following the rules above\n` +
        `- "priority": "critical" only for a major version, a breaking change, or a security issue; "high" for a significant new feature or fix; "normal" for routine or minor changes\n\n` +
        `${t}`,
      { maxTokens: 600, finalOnly: true }
    );
    return parseUpdateSummary(out);
  }

  async extractGoal(htmlText: string, docs?: AIDoc[]): Promise<string | null> {
    const t = this.clip(htmlText, 500, 3000, !!docs?.length);
    return this.trackedComplete(
      `In one sentence (max 25 words), what is the main goal/purpose of the software described below?${this.docNote(
        !!docs?.length
      )}\n\n${t}`,
      { maxTokens: 400, docs, finalOnly: true }
    );
  }

  async semanticMatch(text: string, keywords: string[], docs?: AIDoc[]): Promise<SemanticMatch | null> {
    const t = this.clip(text, 500, 3000, !!docs?.length);
    const out = await this.trackedComplete(
      `Does the following text relate to any of these topics: ${keywords.join(
        ", "
      )}?${this.docNote(!!docs?.length)}\n` +
        `Reply with ONLY a JSON object (no other text) with these keys:\n` +
        `- "match": true or false — does the text genuinely relate to at least one of the topics?\n` +
        `- "topic": which topic it relates to (copy it from the list, "" if none)\n` +
        `- "priority": how important this match is — "critical" only if the text is a direct and significant development about the topic, "high" if clearly related, "normal" if only tangential\n` +
        `- "summary": one plain sentence (max 25 words) explaining what in the text matches the topic and why it matters\n\n` +
        `${t}`,
      { maxTokens: 400, docs, finalOnly: true }
    );
    return parseSemanticMatch(out, keywords);
  }

  async suggestCategory(
    text: string,
    existing: string[],
    docs?: AIDoc[]
  ): Promise<{ category: string; subcategory: string | null; icon: string | null } | null> {
    const t = this.clip(text, 500, 2000, !!docs?.length);
    const existingList = existing.length
      ? `Reuse one of these existing categories for the category part if it fits: ${existing.join(", ")}.\n`
      : "";
    const out = await this.trackedComplete(
      `Classify the project described below in TWO levels, as short lowercase slugs (hyphenated words).${this.docNote(
        !!docs?.length
      )}\n` +
        `Level 1 "category": the GENERIC domain or family the project belongs to — never the specific product, component or feature (firmware for a CNC controller is "cnc", not "cnc-controller-firmware"). 1-2 words, e.g. ai, engineering, gpu, devops, security.\n` +
        `Level 2 "subcategory": the specific thing it is, a few hyphenated words (e.g. cnc-controller-firmware).\n` +
        `Also pick the ICON that best represents the CATEGORY, by copying ONE exact name from this list: ${GLYPH_NAMES.join(", ")}.\n` +
        `Base your answer on what the project actually DOES (its features, the problem it solves). The project or repository name is just a label — NEVER repeat the name (or any part of it) as the category or subcategory.\n` +
        `If the text is too thin to classify confidently, reply "unknown" — do not guess.\n` +
        `${existingList}` +
        `Reply with ONLY: category/subcategory icon (or "category icon" if the subcategory is unclear), or "unknown" if it cannot be determined.\n\n${t}`,
      // Generous budget: thinking models (Qwen3, …) spend their first
      // tokens on internal reasoning before producing the short slug.
      // finalOnly: an empty final answer must stay null (heuristic
      // fallback), never a slugified chain-of-thought.
      { maxTokens: 300, docs, finalOnly: true }
    );
    return parseCategoryPair(out);
  }

  async suggestSubcategory(text: string, category: string, docs?: AIDoc[]): Promise<string | null> {
    const t = this.clip(text, 500, 2000, !!docs?.length);
    const out = await this.trackedComplete(
      `The project described below belongs to the category "${category}".${this.docNote(
        !!docs?.length
      )}\n` +
        `Give the specific SUBCATEGORY: a short lowercase slug of a few hyphenated words describing the specific thing it is (e.g. cnc-controller-firmware — not the generic category itself, and not the project name).\n` +
        `Reply with only the subcategory, or "unknown" if it cannot be determined.\n\n${t}`,
      // Generous budget (thinking models reason first) and finalOnly:
      // never slugify a chain-of-thought preamble into a subcategory.
      { maxTokens: 300, docs, finalOnly: true }
    );
    return normalizeCategory(out);
  }

  async suggestIcon(category: string, context?: string): Promise<string | null> {
    const c = context ? ` The project it tracks: "${context}".` : "";
    const out = await this.trackedComplete(
      `Pick the ICON that best represents the software category "${category}".${c}\n` +
        `Copy ONE exact name from this list: ${GLYPH_NAMES.join(", ")}.\n` +
        `Reply with ONLY the icon name, or "unknown" if none fits.\n`,
      // Same budget rule as suggestCategory: thinking models spend their
      // first tokens on internal reasoning before the short name.
      { maxTokens: 300, finalOnly: true }
    );
    if (!out) return null;
    // A hallucinated name is dropped, never a valid pick (parseCategoryPair).
    const clean = out.trim().toLowerCase().replace(/["'\s]+/g, "");
    return GLYPH_NAMES.includes(clean) ? clean : null;
  }

  async summarizeProject(
    text: string,
    context: string,
    docs?: AIDoc[],
    size: "short" | "medium" | "long" = "medium"
  ): Promise<string | null> {
    // Cover the whole content, not just the opening: the in-prompt clip is
    // generous, and RAG-capable providers get the full document attached.
    const clipLen = size === "short" ? 8000 : size === "long" ? 40000 : 20000;
    const count = size === "short" ? 3 : size === "long" ? 10 : 6;
    const t = this.clip(text, 1000, clipLen, !!docs?.length);
    return this.trackedComplete(
      `Summarize the ENTIRE content below about the project "${context}": what it is, the problem it solves, and its main features — base this on the whole content, not just the beginning.${this.docNote(
        !!docs?.length
      )}\n` +
        `Reply with ONLY ${count} bullet points, one per line, each starting with "- ". No preamble, no headings, no numbering.\n\n${t}`,
      { maxTokens: size === "long" ? 2000 : size === "short" ? 700 : 1200, docs, finalOnly: true }
    );
  }

  async ping(): Promise<string | null> {
    // 128 (not 8): thinking models (Qwen3, DeepSeek…) spend their first tokens
    // on internal reasoning, so the trivial prompt still needs real budget
    // to leave a final answer.
    return this.trackedComplete("Reply with exactly one word: OK", { maxTokens: 128 });
  }
}

class NullProvider implements AIProvider {
  readonly enabled = false;
  readonly kind = "none" as const;
  async summarize(): Promise<string | null> {
    return null;
  }
  async summarizeUpdate(): Promise<UpdateSummary | null> {
    return null;
  }
  async extractGoal(): Promise<string | null> {
    return null;
  }
  async semanticMatch(): Promise<SemanticMatch | null> {
    return null;
  }
  async suggestCategory(): Promise<{ category: string; subcategory: string | null; icon: string | null } | null> {
    return null;
  }
  async suggestSubcategory(): Promise<string | null> {
    return null;
  }

  async suggestIcon(): Promise<string | null> {
    return null;
  }
  async summarizeProject(): Promise<string | null> {
    return null;
  }
  async ping(): Promise<string | null> {
    return null;
  }
  failureInfo(): string | null {
    return null;
  }
}

/**
 * Tolerantly parse an update-summary reply into an UpdateSummary. Small
 * local models often wrap JSON in code fences or add stray text — extract
 * the first {...} block and degrade gracefully (missing/invalid priority →
 * "normal"). Unusable reply (no parseable summary) → null, so callers keep
 * their heuristic summary and priority.
 */
function parseUpdateSummary(out: string | null): UpdateSummary | null {
  if (!out) return null;
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const summary =
    typeof o.summary === "string"
      ? o.summary.trim().replace(/^["']+|["']+$/g, "").trim()
      : "";
  if (!summary) return null;
  let priority: Priority = "normal";
  if (typeof o.priority === "string") {
    const p = o.priority.trim().toLowerCase();
    if (p === "critical" || p === "high" || p === "normal") priority = p;
  }
  return { summary, priority };
}

/**
 * Tolerantly parse a semantic-match reply into a SemanticMatch.
 * Small local models often wrap JSON in code fences or add stray text —
 * extract the first {...} block and degrade gracefully (missing priority →
 * "normal", missing summary/topic → fallbacks). Unusable reply → null,
 * i.e. treated as no match by callers.
 */
function parseSemanticMatch(out: string | null, keywords: string[]): SemanticMatch | null {
  if (!out) return null;
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  // Small models sometimes answer "match": "true" (a string) — accept it.
  if (o.match !== true && o.match !== "true") return null;

  let priority: Priority = "normal";
  if (typeof o.priority === "string") {
    const p = o.priority.trim().toLowerCase();
    if (p === "critical" || p === "high" || p === "normal") priority = p;
  }
  const summary =
    typeof o.summary === "string"
      ? o.summary.trim().replace(/^["']+|["']+$/g, "").trim()
      : "";
  const topic =
    typeof o.topic === "string" && o.topic.trim()
      ? o.topic.trim()
      : keywords.slice(0, 3).join(", ");
  return {
    match: true,
    topic,
    summary: summary || `The text relates to: ${topic}`,
    priority,
  };
}

/**
 * Strip a model's internal reasoning blocks (its "think" tags) from a
 * reply when a serving stack inlines them in the answer instead of a
 * separate reasoning_content field (e.g. vLLM without a reasoning
 * parser). An UNCLOSED opening tag (the token budget ran out
 * mid-thought) swallows the rest of the reply too. Empty result = the
 * reply was pure thinking.
 */
// The thinking model's reasoning tags ("think" and "/think" wrapped in
// angle brackets, e.g. Qwen3's). Built from char codes on purpose: a raw
// tag in this file gets mangled by markup-aware tooling.
const THINK_OPEN = String.fromCharCode(60) + "think";
const THINK_CLOSE = String.fromCharCode(60) + "/think" + String.fromCharCode(62);

function stripThinkingBlocks(text: string): string {
  let s = text;
  let idx: number;
  while ((idx = s.indexOf(THINK_OPEN)) !== -1) {
    const end = s.indexOf(THINK_CLOSE, idx);
    if (end === -1) {
      // Unclosed: the token budget ran out mid-thought — the rest of the
      // reply is still thinking.
      s = s.slice(0, idx);
      break;
    }
    s = s.slice(0, idx) + " " + s.slice(end + THINK_CLOSE.length);
  }
  return s.trim();
}

/** Normalize a model reply into a valid category slug (null when unusable). */
export function normalizeCategory(out: string | null): string | null {
  if (!out) return null;
  // Thinking-model leak guard: a valid reply is a short slug (at most a few
  // words), never prose — a chain-of-thought preamble ("Let me analyze
  // this project PRs…") or a sentence must not be slugified into a bogus
  // category. (Primary fix is finalOnly in the providers; this catches
  // anything that leaks through other paths, e.g. MCP.)
  const raw = stripThinkingBlocks(out);
  if (!raw) return null;
  if (raw.split(/\s+/).filter(Boolean).length > 4) return null;
  if (/[.!?]/.test(raw)) return null;
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/["'.]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!s) return null;
  // "n/a" and "n.a" normalize to "na" (dots/slashes are stripped) — reject
  // it alongside the dashed spelling the model sometimes emits.
  if (["unknown", "none", "n-a", "na", "unclear", "general", "other"].includes(s)) return null;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) return null;
  return s.length > 30 ? s.slice(0, 30) : s;
}

/**
 * Parse a "category/subcategory icon" model reply. The icon is the LAST
 * whitespace-separated token when (and only when) it matches a curated
 * Glyphs name — a hallucinated icon is dropped (icon = null), never a
 * category. Missing or unusable subcategory → null; unusable category →
 * null.
 */
function parseCategoryPair(
  out: string | null
): { category: string; subcategory: string | null; icon: string | null } | null {
  if (!out) return null;
  // Strip inline thinking blocks BEFORE the "/" split: a closing tag
  // contains a slash that would otherwise be mistaken for the
  // category/subcategory separator.
  out = stripThinkingBlocks(out);
  let clean = out.trim().toLowerCase().replace(/^["'\s]+|["'\s]+$/g, "");
  // Trailing icon: last token of the whole reply, only when it is one of
  // the curated names (the model was told to copy it verbatim).
  let icon: string | null = null;
  const m = clean.match(/\s([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (m && GLYPH_NAMES.includes(m[1])) {
    icon = m[1];
    clean = clean.slice(0, m.index).trim();
  }
  // "n/a" as a WHOLE reply means "not applicable" — reject it before the
  // "/" split below would turn it into the bogus pair {n, a}.
  if (["n/a", "n.a", "n a"].includes(clean)) return null;
  const i = clean.indexOf("/");
  const catPart = i === -1 ? clean : clean.slice(0, i);
  const subPart = i === -1 ? "" : clean.slice(i + 1);
  const category = normalizeCategory(catPart);
  if (!category) return null;
  const subcategory = subPart.trim() ? normalizeCategory(subPart) : null;
  return { category, subcategory, icon };
}

/* ------------------------------------------------------------------ */
/* Ollama (local models)                                               */
/* ------------------------------------------------------------------ */

/** Short-lived cache so we don't hit /api/tags on every generation. */
const modelPresence = new Map<string, { state: "installed" | "missing"; at: number }>();
const PRESENCE_TTL = 15_000;

async function ollamaModelState(
  url: string,
  model: string
): Promise<"installed" | "missing" | "unknown"> {
  const key = `${url}|${model}`;
  const hit = modelPresence.get(key);
  if (hit && Date.now() - hit.at < PRESENCE_TTL) return hit.state;
  const installed = await ollamaInstalled(url);
  if (installed === null) return "unknown"; // server unreachable — fail softly
  // Normalized compare: "qwen3.5", "qwen3.5:latest" and "Qwen3.5" all match
  // the same install (exact-string compare broke on missing ":tag").
  const want = normalizeOllamaModel(model);
  const state =
    installed.some((m) => normalizeOllamaModel(m) === want) ||
    // The auto-download may have finished while a "missing" state was still
    // cached: a completed pull job means the model is present even though
    // /api/tags has not been re-fetched yet.
    pullJobFor(model)?.status === "done"
      ? "installed"
      : "missing";
  modelPresence.set(key, { state, at: Date.now() });
  return state;
}

/** Pull job for a model (registry keys are raw names — match normalized). */
function pullJobFor(model: string): PullJob | undefined {
  const want = normalizeOllamaModel(model);
  return Object.values(getPullJobs()).find((j) => normalizeOllamaModel(j.name) === want);
}

class OllamaProvider extends BaseAI {
  readonly kind = "ollama" as const;
  readonly enabled = true;
  private url: string;
  private model: string;
  private keepAlive: string;

  constructor(url: string, model: string, keepAlive = "5") {
    super();
    this.url = url.replace(/\/+$/, "");
    this.model = model;
    this.keepAlive = keepAlive;
  }

  /** Ollama keep_alive duration: "N" minutes, or "never" → keep loaded. */
  private get keepAliveParam(): string {
    if (this.keepAlive === "never") return "-1";
    return /^\d+$/.test(this.keepAlive) ? `${this.keepAlive}m` : "5m";
  }

  /**
   * Ollama ≥ 0.6.2 supports the `files` RAG parameter. Synchronous mirror
   * of the async probe in ragSupported() (false until the probe has run),
   * so BaseAI's clip/docNote budgets match what complete() actually sends:
   * on older servers the docs are INLINED into the prompt, not attached —
   * the in-prompt anchor must keep the full (larger) budget, not the tiny
   * with-doc one, and the "document attached" note would be a lie.
   */
  private ragOk = false;
  protected get supportsDocs(): boolean {
    return this.ragOk;
  }

  protected async complete(prompt: string, opts: CompleteOpts = {}): Promise<string | null> {
    try {
      const state = await ollamaModelState(this.url, this.model);
      if (state === "missing") {
        // The single auto-download path: AI was requested but the model is
        // not on the machine yet. Start a background pull; this call returns
        // null and the UI shows the "model must be downloaded / downloading"
        // message via the pull registry.
        startPull(this.url, this.model);
        return null;
      }
      const docs = (opts.docs ?? []).filter((d) => d.content.trim().length > 0).slice(0, 8);
      // Built-in RAG (Ollama ≥ 0.6.2): the server chunks, embeds and
      // retrieves from the files, so the model only sees the most relevant
      // parts of a long document instead of a truncated prefix.
      if (docs.length > 0 && (await this.ragSupported())) {
        const out = await this.ragChat(prompt, docs, opts.maxTokens ?? 300);
        if (out) return out;
      }
      if (docs.length > 0) {
        // Older Ollama (no `files` support) or the chat call failed: inline
        // the document content (truncated) so the model still sees context.
        const docText = docs.map((d) => d.content).join("\n\n").slice(0, 4000);
        prompt = `${prompt}\n\n--- Document content ---\n${docText}`;
      }
      const res = await fetch(`${this.url}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          keep_alive: this.keepAliveParam,
          options: { temperature: 0.1, num_predict: opts.maxTokens ?? 300 },
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { response?: string };
      // Strip inline thinking blocks: some Ollama versions return a
      // thinking model's reasoning (Qwen3, …) inside the response instead
      // of a separate reasoning_content field.
      const out = stripThinkingBlocks(json.response ?? "");
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  }

  /**
   * Is the server new enough for built-in RAG (`files` on /api/chat, added
   * in 0.6.2)? Probed via /api/version once per server, cached 10 minutes.
   * Older servers silently ignore unknown request fields, so a version
   * check is the only reliable way to tell.
   */
  private async ragSupported(): Promise<boolean> {
    const hit = ragProbe.get(this.url);
    if (hit && Date.now() - hit.at < RAG_PROBE_TTL_MS) {
      this.ragOk = hit.ok;
      return hit.ok;
    }
    let ok = false;
    try {
      const v = await ollamaVersion(this.url);
      if (v) {
        ok = versionGte(v, "0.6.2");
        ragProbe.set(this.url, { ok, at: Date.now() });
      }
    } catch {
      // Unknown (server unreachable?) — retry on the next call.
    }
    this.ragOk = ok;
    return ok;
  }

  /** One chat call with the Ollama built-in RAG over the given documents. */
  private async ragChat(
    prompt: string,
    docs: AIDoc[],
    maxTokens: number
  ): Promise<string | null> {
    try {
      const used = new Set<string>();
      const files: Record<string, { contents: string }> = {};
      for (let i = 0; i < docs.length; i++) {
        let name =
          docs[i].name.replace(/[^\w.-]+/g, "_").slice(0, 64) || `doc${i + 1}.txt`;
        if (used.has(name)) name = `${name}_${i + 1}`;
        used.add(name);
        files[name] = { contents: docs[i].content.slice(0, 40_000) };
      }
      const res = await fetch(`${this.url}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          files,
          stream: false,
          keep_alive: this.keepAliveParam,
          options: { temperature: 0.1, num_predict: maxTokens },
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { message?: { content?: string } };
      const out = stripThinkingBlocks(json.message?.content ?? "");
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  }
}

/** RAG-support probe results per Ollama server URL (10-minute TTL). */
const ragProbe = new Map<string, { ok: boolean; at: number }>();
const RAG_PROBE_TTL_MS = 10 * 60_000;

/** "0.6.10" >= "0.6.2" — dot-separated numeric comparison (missing part = 0). */
function versionGte(v: string, min: string): boolean {
  const a = v.split(".").map((n) => parseInt(n, 10) || 0);
  const b = min.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible (OpenAI, LM Studio, vLLM, Ollama /v1, …)          */
/* ------------------------------------------------------------------ */

/** This process runs inside a Docker container (docker run creates /.dockerenv). */
function inDocker(): boolean {
  try {
    return existsSync("/.dockerenv");
  } catch {
    return false;
  }
}

/**
 * Turn a failed fetch into a short, human-readable reason. undici reports
 * the underlying socket error on `e.cause` (code ECONNREFUSED, ENOTFOUND, …)
 * and AbortSignal.timeout throws a TimeoutError — map those to actionable
 * text instead of the bare "fetch failed".
 */
function describeFetchError(e: unknown, url: string): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  const code = err?.cause?.code;
  if (err?.name === "TimeoutError" || err?.name === "AbortError")
    return "timed out — the endpoint did not answer in time";
  if (code === "ECONNREFUSED")
    return `connection refused — nothing is listening at ${url} (server not running, or wrong address/port)`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return `host not found — check the address in "${url}" (typo, DNS, or the server is on another machine)`;
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET")
    return `connection reset — ${err?.cause?.message ?? "the server dropped the connection"}`;
  let out = `request failed — ${err?.message || String(e)}`;
  // The classic Docker gotcha: the URL looks right on the HOST machine, but
  // inside the container localhost/127.0.0.1 is the container itself.
  if (/localhost|127\.0\.0\.1|\[?::1\]?/.test(url) && inDocker()) {
    out +=
      " — ProjectPulse runs inside Docker, so localhost points at the container, not your machine. Use http://host.docker.internal:<port>/v1 (Windows/macOS) or the host's LAN IP instead.";
  }
  return out;
}

class OpenAICompatibleProvider extends BaseAI {
  readonly kind = "openai" as const;
  readonly enabled = true;
  private base: string;
  private key: string;
  private model: string;
  /**
   * Qwen3 is a "thinking" model: it generates a long chain of thought in
   * addition to the answer, and `max_tokens` covers BOTH — with thinking on,
   * a ~400-token CoT leaves a 300-token budget with nothing for the answer
   * and the reply comes back with empty `content`. Qwen3's chat template
   * supports the `/no_think` soft switch, and vLLM additionally honours
   * `chat_template_kwargs.enable_thinking` — send both so whichever layer
   * the server implements turns reasoning off. (Only for Qwen3 — other
   * models never see these.)
   */
  private noThink: boolean;

  constructor(base: string, key: string, model: string) {
    super();
    this.base = base.replace(/\/+$/, "");
    this.key = key;
    this.model = model;
    this.noThink = /qwen3/i.test(model);
  }

  /** No RAG support here — docs (if any) are ignored; BaseAI keeps the full
   *  in-prompt truncation budget. */
  protected async complete(prompt: string, opts: CompleteOpts = {}): Promise<string | null> {
    const url = `${this.base}/chat/completions`;
    this.lastError = null;
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.key) headers.authorization = `Bearer ${this.key}`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "user", content: this.noThink ? `${prompt} /no_think` : prompt },
          ],
          temperature: 0.1,
          max_tokens: opts.maxTokens ?? 300,
          stream: false,
          // vLLM: template-level switch for Qwen3 (ignored by non-vLLM servers).
          ...(this.noThink ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        // Keep the server's error body (truncated) — it usually says exactly
        // what is wrong (invalid key, unknown model, …).
        let body = "";
        try {
          body = (await res.text()).trim().slice(0, 300);
        } catch {
          // body unreadable — the status code alone is still useful
        }
        const hint =
          res.status === 401 || res.status === 403
            ? " (check the API key)"
            : res.status === 404
              ? ` (check the model name "${this.model}" and that the base URL ends in /v1)`
              : "";
        this.lastError =
          `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""} from ${url}${hint}` +
          (body ? ` — ${body}` : "");
        return null;
      }
      const json = (await res.json()) as {
        choices?: {
          message?: { content?: string; reasoning_content?: string };
        }[];
      };
      const choice = json.choices?.[0];
      // Some serving stacks inline a thinking model's internal thinking
      // blocks in the answer instead of a separate reasoning_content field
      // — strip them so only the final answer remains (empty when the reply
      // was pure thinking).
      const out = stripThinkingBlocks(choice?.message?.content ?? "");
      if (out) return out;
      // Thinking models (Qwen3, DeepSeek, …) put their chain-of-thought in
      // reasoning_content; when the token budget is eaten by thinking, the
      // final content is empty. For free-text callers (ping, summarize, …)
      // the reasoning text still proves the model ran and is the best
      // available answer. Structured callers pass finalOnly and get null
      // instead, so their heuristics take over rather than a slugified
      // chain-of-thought (e.g. "Let me analyze this project…" becoming a
      // bogus category slug).
      if (!opts.finalOnly) {
        const reasoning = (choice?.message?.reasoning_content ?? "").trim();
        if (reasoning) return reasoning;
      }
      this.lastError = opts.finalOnly
        ? `Model "${this.model}" produced no final answer — its internal reasoning (thinking model, e.g. Qwen3/DeepSeek) used the whole token budget`
        : `Endpoint answered OK but returned an empty completion for model "${this.model}" — if this is a thinking model (Qwen3, DeepSeek…), its internal reasoning used the whole token budget`;
      return null;
    } catch (e) {
      this.lastError = describeFetchError(e, url);
      return null;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Anthropic (Claude)                                                  */
/* ------------------------------------------------------------------ */

class AnthropicProvider extends BaseAI {
  readonly kind = "anthropic" as const;
  readonly enabled = true;
  private key: string;
  private model: string;

  constructor(key: string, model: string) {
    super();
    this.key = key;
    this.model = model;
  }

  /** No RAG support here — docs (if any) are ignored. */
  protected async complete(prompt: string, opts: CompleteOpts = {}): Promise<string | null> {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: opts.maxTokens ?? 300,
          temperature: 0.1,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      const out = (json.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("")
        .trim();
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------------------------ */
/* MCP (remote server, e.g. another machine running local AI)          */
/* ------------------------------------------------------------------ */

class MCPProvider extends BaseAI {
  readonly kind = "mcp" as const;
  readonly enabled = true;
  private url: string;
  private toolName: string;
  private argName: string;
  private client: import("@modelcontextprotocol/sdk/client").Client | null = null;
  private toolDef: { name: string; inputSchema?: { properties?: Record<string, { type?: string }> } } | null = null;

  constructor(url: string, toolName: string, argName: string) {
    super();
    this.url = url;
    this.toolName = toolName;
    this.argName = argName;
  }

  private async ensure(): Promise<void> {
    if (this.client) return;
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );
    const client = new Client({ name: "projectpulse", version: "1.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(this.url)),
      { timeout: 30_000 }
    );
    const { tools } = await client.listTools();
    const pick = this.toolName
      ? tools.find((t) => t.name === this.toolName) ?? tools[0]
      : tools.find((t) => /generat|chat|complet|prompt|summar|text/i.test(t.name)) ?? tools[0];
    if (!pick) throw new Error("MCP server exposes no usable tools");
    this.toolDef = pick as typeof pick;
    this.client = client;
  }

  private argKey(): string {
    if (this.argName) return this.argName;
    const props = this.toolDef?.inputSchema?.properties;
    if (props) {
      const names = Object.keys(props);
      const hit = names.find((n) => /prompt|input|text|message|query|content/i.test(n));
      if (hit) return hit;
      const str = names.find((n) => props[n]?.type === "string");
      if (str) return str;
    }
    return "prompt";
  }

  protected async complete(prompt: string, _opts?: CompleteOpts): Promise<string | null> {
    try {
      await this.ensure();
      const res = await this.client!.callTool(
        { name: this.toolDef!.name, arguments: { [this.argKey()]: prompt } },
        undefined,
        { timeout: 180_000 }
      );
      const content = (res as { content?: { type: string; text?: string }[] }).content;
      const out = Array.isArray(content)
        ? content
            .filter((c) => c.type === "text")
            .map((c) => c.text ?? "")
            .join("\n")
            .trim()
        : String(content ?? "").trim();
      return out.length > 0 ? out : null;
    } catch {
      this.lastError = `MCP server call failed — check that the MCP server at ${this.url} is running and reachable`;
      this.client = null;
      this.toolDef = null;
      return null;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Configuration, state and provider selection                         */
/* ------------------------------------------------------------------ */

export interface AIConfig {
  provider: ProviderKind;
  model: string;
  ollamaUrl: string;
  openaiUrl: string;
  openaiKey: string;
  anthropicKey: string;
  mcpUrl: string;
  mcpTool: string;
  mcpArg: string;
  /** minutes the Ollama model stays loaded after each use ("5", "60", … or "never") */
  ollamaKeepAlive: string;
}

const CONFIG_KEYS: (keyof AIConfig)[] = [
  "provider",
  "model",
  "ollamaUrl",
  "openaiUrl",
  "openaiKey",
  "anthropicKey",
  "mcpUrl",
  "mcpTool",
  "mcpArg",
  "ollamaKeepAlive",
];

function defaultConfig(): AIConfig {
  return {
    provider: "ollama",
    model: process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
    // Always resolved to a concrete endpoint (env var, bundled compose
    // service inside Docker, or host loopback) — so Ollama works out of
    // the box without the user having to figure out the address.
    ollamaUrl: defaultOllamaUrl(),
    openaiUrl: process.env.OPENAI_URL || "https://api.openai.com/v1",
    openaiKey: process.env.OPENAI_API_KEY || "",
    anthropicKey: process.env.ANTHROPIC_API_KEY || "",
    mcpUrl: process.env.MCP_URL || "",
    mcpTool: "",
    mcpArg: "",
    ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE || "5",
  };
}

/**
 * 0.0.0.0 (and [::]) are BIND addresses, not connectable targets — a client
 * must dial 127.0.0.1. Applied on read AND on save so a pasted server-style
 * address never silently breaks the connection check.
 */
function normalizeUrl(v: string): string {
  const m = v.trim().match(/^(https?):\/\/\[?(0\.0\.0\.0|::)\]?(:\d+)?(\/.*)?$/i);
  return m ? `${m[1]}://127.0.0.1${m[3] ?? ""}${m[4] ?? ""}` : v;
}

/** Config = env defaults overridden by values saved in Settings (DB). */
export function readAIConfig(): AIConfig {
  const cfg = defaultConfig();
  try {
    const d = getDb();
    for (const k of CONFIG_KEYS) {
      const v = getSetting(d, `ai.${k}`);
      if (v !== null) (cfg as unknown as Record<string, unknown>)[k] = v;
    }
    const p = cfg.provider;
    if (p !== "ollama" && p !== "openai" && p !== "anthropic" && p !== "mcp")
      cfg.provider = "ollama";
    cfg.ollamaUrl = normalizeUrl(cfg.ollamaUrl);
    cfg.openaiUrl = normalizeUrl(cfg.openaiUrl);
    cfg.mcpUrl = normalizeUrl(cfg.mcpUrl);
  } catch {
    // DB not ready yet — env defaults only
  }
  return cfg;
}

export function saveAIConfig(
  patch: Partial<AIConfig> & { enabled?: "on" | "off" | null }
): void {
  const d = getDb();
  const urlKeys: (keyof AIConfig)[] = ["ollamaUrl", "openaiUrl", "mcpUrl"];
  for (const k of CONFIG_KEYS) {
    const v = patch[k];
    if (v === undefined) continue;
    const val = urlKeys.includes(k) ? normalizeUrl(String(v)) : String(v);
    setSetting(d, `ai.${k}`, val === "" ? null : val);
  }
  if (patch.enabled === "on") setSetting(d, "ai.enabled", "on");
  else if (patch.enabled === "off") setSetting(d, "ai.enabled", "off");
  else if (patch.enabled === null) setSetting(d, "ai.enabled", null);
}

function userOverride(): "on" | "off" | null {
  try {
    const v = getSetting(getDb(), "ai.enabled");
    return v === "on" ? "on" : v === "off" ? "off" : null;
  } catch {
    return null;
  }
}

function isConfigured(cfg: AIConfig): boolean {
  switch (cfg.provider) {
    case "ollama":
      return cfg.ollamaUrl.trim() !== "";
    case "openai":
      return cfg.openaiUrl.trim() !== "";
    case "anthropic":
      return cfg.anthropicKey.trim() !== "";
    case "mcp":
      return cfg.mcpUrl.trim() !== "";
  }
}

function effectiveEnabled(cfg: AIConfig): boolean {
  return (
    isConfigured(cfg) &&
    process.env.AI_ENABLED !== "false" &&
    userOverride() !== "off"
  );
}

function buildProvider(cfg: AIConfig): AIProvider {
  switch (cfg.provider) {
    case "ollama":
      return new OllamaProvider(cfg.ollamaUrl, cfg.model || DEFAULT_OLLAMA_MODEL, cfg.ollamaKeepAlive);
    case "openai":
      return new OpenAICompatibleProvider(cfg.openaiUrl, cfg.openaiKey, cfg.model);
    case "anthropic":
      return new AnthropicProvider(cfg.anthropicKey, cfg.model || "claude-haiku-4-5");
    case "mcp":
      return new MCPProvider(cfg.mcpUrl, cfg.mcpTool, cfg.mcpArg);
  }
}

/**
 * Provider methods tracked as "AI work" (each can take seconds to minutes).
 * Friendly labels show up in the nav ring while work is in flight.
 */
const TRACKED_LABELS: Partial<Record<keyof AIProvider, string>> = {
  summarize: "summarizing changes",
  summarizeUpdate: "summarizing updates",
  extractGoal: "extracting project goal",
  semanticMatch: "semantic keyword matching",
  suggestCategory: "classifying category",
  suggestSubcategory: "classifying subcategory",
  summarizeProject: "summarizing project",
  ping: "testing AI",
};

/**
 * Wrap a provider so every tracked call is recorded in the AI activity
 * registry (src/lib/ai-activity.ts): the nav shows a "processing" ring while
 * ANY work is in flight — manual checks, check-all, the scheduler,
 * fire-and-forget background requeues — and the badge can surface real
 * engine failures. Disabled providers (NullProvider) pass through
 * untracked: "AI off" is a state, not an error.
 */
function wrapProvider(p: AIProvider): AIProvider {
  if (!p.enabled) return p;
  const out: Record<string, unknown> = {};
  // Walk the WHOLE prototype chain, not just own properties: class fields
  // (kind/enabled) are own, but every method (summarize, ping, …) is defined
  // on BaseAI's prototype — copying only own props produced a wrapper with
  // no methods at all ("e.ping is not a function").
  for (
    let proto: object | null = p;
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (k !== "constructor" && !(k in out))
        out[k] = (p as unknown as Record<string, unknown>)[k];
    }
  }
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "function") out[k] = (out[k] as (...a: unknown[]) => unknown).bind(p);
  }
  for (const [k, label] of Object.entries(TRACKED_LABELS)) {
    const orig = out[k];
    if (typeof orig === "function") {
      out[k] = (...args: unknown[]) => trackAIWork(label!, () => (orig as (...a: unknown[]) => Promise<unknown>)(...args));
    }
  }
  return out as unknown as AIProvider;
}

const nullProvider = new NullProvider();
let cache: { sig: string; provider: AIProvider } | null = null;

export function getAI(): AIProvider {
  const cfg = readAIConfig();
  const sig = JSON.stringify(cfg) + "|" + (userOverride() ?? "env");
  if (cache && cache.sig === sig) return cache.provider;
  const provider = effectiveEnabled(cfg) ? wrapProvider(buildProvider(cfg)) : nullProvider;
  cache = { sig, provider };
  return provider;
}

/** Synchronous label for the health endpoint (no network calls). */
export function aiProviderLabel(): { provider: ProviderKind | "none"; model: string | null } {
  const cfg = readAIConfig();
  if (!effectiveEnabled(cfg)) return { provider: "none", model: null };
  return {
    provider: cfg.provider,
    model: cfg.provider === "mcp" ? cfg.mcpUrl || null : cfg.model || null,
  };
}

export interface AIState {
  enabled: boolean;
  configured: boolean;
  envOff: boolean;
  userOverride: "on" | "off" | null;
  provider: ProviderKind;
  model: string | null;
  /** minutes the Ollama model stays loaded after use ("5", "60", … or "never") */
  ollamaKeepAlive: string;
  /** openai/anthropic/mcp: whether the remote endpoint answered the last check.
   *  true = green, false = yellow (enabled but no connection), null = not applicable. */
  reachable: boolean | null;
  ollama?: {
    reachable: boolean;
    version: string | null;
    /** built-in RAG (`files` on /api/chat) is available — Ollama ≥ 0.6.2 */
    ragSupported: boolean;
    installed: string[];
    loaded: string[];
    modelInstalled: boolean;
    modelLoaded: boolean;
    /**
     * /api/show probe of the configured model (model files resolvable,
     * checked WITHOUT loading the model). null = probe unavailable (old
     * Ollama or server unreachable).
     */
    modelIntact: boolean | null;
    pulls: Record<string, import("./ollama").PullJob>;
  };
  /**
   * Engine health from REAL AI calls (no artificial probes): failures in
   * the last hour + the last success/error, recorded by the activity
   * registry (src/lib/ai-activity.ts). Present when AI is enabled.
   */
  health?: {
    failures: number;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
  };
}

/* ── Remote endpoint reachability (openai / anthropic / mcp) ──────────────
 * Green badge = the provider endpoint answered, yellow = enabled but
 * unreachable. Results are cached for 30 s so the 15 s badge poll doesn't
 * hammer the provider. */
const REACH_TTL_MS = 30_000;
let reachCache: { sig: string; at: number; ok: boolean } | null = null;

async function checkRemoteReachable(cfg: AIConfig): Promise<boolean> {
  const sig = JSON.stringify([
    cfg.provider,
    cfg.openaiUrl,
    cfg.mcpUrl,
    cfg.openaiKey,
    cfg.anthropicKey,
  ]);
  if (reachCache && reachCache.sig === sig && Date.now() - reachCache.at < REACH_TTL_MS)
    return reachCache.ok;

  let ok = false;
  try {
    if (cfg.provider === "openai") {
      // /models with the configured key: 200 = reachable AND authed.
      // Some gateways (local / custom) don't implement /models — a 404 or
      // 405 still proves the endpoint is up, so treat those as reachable.
      // 401/403 (bad key) or a dead host → yellow.
      const base = cfg.openaiUrl.replace(/\/+$/, "");
      const r = await fetch(`${base}/models`, {
        headers: cfg.openaiKey ? { authorization: `Bearer ${cfg.openaiKey}` } : undefined,
        signal: AbortSignal.timeout(4000),
      });
      ok = r.status === 200 || r.status === 404 || r.status === 405;
    } else if (cfg.provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: {
          "x-api-key": cfg.anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(4000),
      });
      ok = r.status === 200;
    } else if (cfg.provider === "mcp") {
      // Any HTTP response (even 405) proves the MCP server is up.
      await fetch(cfg.mcpUrl, { method: "GET", signal: AbortSignal.timeout(4000) });
      ok = true;
    }
  } catch {
    ok = false;
  }
  reachCache = { sig, at: Date.now(), ok };
  return ok;
}

/**
 * Ollama model-integrity probe (POST /api/show): validates the configured
 * model's files WITHOUT loading the model into memory, so keep_alive /
 * auto-unload behavior is untouched. Cached 60 s per url|model so the 5 s
 * badge poll costs one probe per minute.
 */
const SHOW_TTL_MS = 60_000;
let showCache: { key: string; at: number; ok: boolean | null } | null = null;

async function probeOllamaModel(cfg: AIConfig): Promise<boolean | null> {
  const model = cfg.model || DEFAULT_OLLAMA_MODEL;
  const key = `${cfg.ollamaUrl}|${model}`;
  if (showCache && showCache.key === key && Date.now() - showCache.at < SHOW_TTL_MS)
    return showCache.ok;
  const { ollamaModelInfo } = await import("./ollama");
  const ok = await ollamaModelInfo(cfg.ollamaUrl, model);
  showCache = { key, at: Date.now(), ok };
  return ok;
}

/**
 * Ollama status snapshot cache (60 s per URL). The navbar badge and settings
 * page poll /api/ai every few seconds, and each fresh snapshot costs three
 * HTTP calls to Ollama (/api/tags, /api/ps, /api/version) — on an always-on
 * machine that keeps the server busy for no visible reason. Model download
 * progress is unaffected: `pulls` comes from the live in-memory job registry,
 * not the snapshot.
 */
const SNAP_TTL_MS = 60_000;
let snapCache: { url: string; at: number; snap: OllamaSnapshot } | null = null;

async function cachedOllamaSnapshot(url: string): Promise<OllamaSnapshot> {
  if (snapCache && snapCache.url === url && Date.now() - snapCache.at < SNAP_TTL_MS)
    return snapCache.snap;
  const snap = await ollamaSnapshot(url);
  snapCache = { url, at: Date.now(), snap };
  return snap;
}

/** Full AI state for the UI (navbar badge + settings page). */
export async function aiState(): Promise<AIState> {
  const cfg = readAIConfig();
  const override = userOverride();
  const envOff = process.env.AI_ENABLED === "false";
  const enabled = effectiveEnabled(cfg);
  const state: AIState = {
    enabled,
    configured: isConfigured(cfg),
    envOff,
    userOverride: override,
    provider: cfg.provider,
    model: cfg.provider === "mcp" ? null : cfg.model || null,
    ollamaKeepAlive: cfg.ollamaKeepAlive,
    reachable: null,
  };

  if (enabled && cfg.provider !== "ollama") {
    state.reachable = await checkRemoteReachable(cfg);
  }
  if (cfg.provider === "ollama" && cfg.ollamaUrl) {
    const { getPullJobs, normalizeOllamaModel } = await import("./ollama");
    const snap = await cachedOllamaSnapshot(cfg.ollamaUrl);
    const model = cfg.model || DEFAULT_OLLAMA_MODEL;
    // Normalized compare: "qwen3.5", "qwen3.5:latest" and "Qwen3.5" all
    // match the same install (exact-string compare broke on the missing tag).
    const modelKey = normalizeOllamaModel(model);
    state.ollama = {
      reachable: snap.reachable,
      version: snap.version,
      ragSupported: !!snap.version && versionGte(snap.version, "0.6.2"),
      installed: snap.installed,
      loaded: snap.loaded,
      modelInstalled: snap.installed.some((m) => normalizeOllamaModel(m) === modelKey),
      modelLoaded: snap.loaded.some((m) => normalizeOllamaModel(m) === modelKey),
      // /api/show: model files resolvable WITHOUT loading the model into
      // memory (keep_alive / auto-unload behavior untouched). null = probe
      // unavailable (old Ollama or server unreachable) → check skipped.
      modelIntact: snap.reachable ? await probeOllamaModel(cfg) : null,
      pulls: getPullJobs(),
    };
  }
  if (enabled) {
    // Engine health from REAL calls (null result / error → failure). The
    // badge turns amber after repeated failures even when the endpoint is up.
    const a = aiActivity();
    state.health = {
      failures: a.failures,
      lastSuccessAt: a.lastSuccessAt,
      lastError: a.lastError,
      lastErrorAt: a.lastErrorAt,
    };
  }
  return state;
}

/** Run a trivial generation through the active provider (Test button). */
export async function testAI(): Promise<{
  ok: boolean;
  reply: string | null;
  error: string | null;
}> {
  const ai = getAI();
  if (!ai.enabled)
    return { ok: false, reply: null, error: "AI is disabled or not configured" };
  const reply = await ai.ping();
  return reply
    ? { ok: true, reply, error: null }
    : {
        ok: false,
        reply: null,
        error:
          ai.failureInfo() ??
          "No response. Check the provider URL/key/model — and for Ollama, that the model is downloaded (see the model list below).",
      };
}
