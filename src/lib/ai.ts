/**
 * AI provider seam.
 *
 * Providers (selected in Settings or via env):
 *   - Ollama: local models (qwen2.5:7b default); the model is loaded
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
import { getDb, getSetting, setSetting } from "./db";
import type { Priority } from "./db";
import {
  DEFAULT_OLLAMA_MODEL,
  defaultOllamaUrl,
  ollamaInstalled,
  ollamaVersion,
  startPull,
} from "./ollama";

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

export interface AIProvider {
  readonly enabled: boolean;
  readonly kind: ProviderKind | "none";
  /** Summarize a diff/changes for a project. */
  summarize(diff: string, context: string): Promise<string | null>;
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
   * (e.g. "cnc-controller-firmware"). null = AI unavailable / unparseable
   * reply (callers fall back to heuristics).
   */
  suggestCategory(
    text: string,
    existing: string[],
    docs?: AIDoc[]
  ): Promise<{ category: string; subcategory: string | null } | null>;
  /**
   * Specific subcategory (a few hyphenated words) for a project that is
   * already in a known category (e.g. "cnc" → "cnc-controller-firmware").
   * null = AI unavailable / unparseable reply.
   */
  suggestSubcategory(text: string, category: string, docs?: AIDoc[]): Promise<string | null>;
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
}

/** Shared prompt-building on top of a raw text completion. */
abstract class BaseAI implements AIProvider {
  abstract readonly kind: ProviderKind;
  abstract readonly enabled: boolean;
  protected abstract complete(
    prompt: string,
    opts?: { maxTokens?: number; docs?: AIDoc[] }
  ): Promise<string | null>;
  /** Whether the provider can receive RAG documents (Ollama ≥ 0.6.2 only). */
  protected get supportsDocs(): boolean {
    return false;
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

  async summarize(diff: string, context: string): Promise<string | null> {
    const d = diff.length > 4000 ? diff.slice(0, 4000) : diff;
    return this.complete(
      `Summarize these changes to the project "${context}" in one or two plain sentences. No preamble.\n\n${d}`,
      { maxTokens: 300 }
    );
  }

  async extractGoal(htmlText: string, docs?: AIDoc[]): Promise<string | null> {
    const t = this.clip(htmlText, 500, 3000, !!docs?.length);
    return this.complete(
      `In one sentence (max 25 words), what is the main goal/purpose of the software described below?${this.docNote(
        !!docs?.length
      )}\n\n${t}`,
      { maxTokens: 120, docs }
    );
  }

  async semanticMatch(text: string, keywords: string[], docs?: AIDoc[]): Promise<SemanticMatch | null> {
    const t = this.clip(text, 500, 3000, !!docs?.length);
    const out = await this.complete(
      `Does the following text relate to any of these topics: ${keywords.join(
        ", "
      )}?${this.docNote(!!docs?.length)}\n` +
        `Reply with ONLY a JSON object (no other text) with these keys:\n` +
        `- "match": true or false — does the text genuinely relate to at least one of the topics?\n` +
        `- "topic": which topic it relates to (copy it from the list, "" if none)\n` +
        `- "priority": how important this match is — "critical" only if the text is a direct and significant development about the topic, "high" if clearly related, "normal" if only tangential\n` +
        `- "summary": one plain sentence (max 25 words) explaining what in the text matches the topic and why it matters\n\n` +
        `${t}`,
      { maxTokens: 200, docs }
    );
    return parseSemanticMatch(out, keywords);
  }

  async suggestCategory(
    text: string,
    existing: string[],
    docs?: AIDoc[]
  ): Promise<{ category: string; subcategory: string | null } | null> {
    const t = this.clip(text, 500, 2000, !!docs?.length);
    const existingList = existing.length
      ? `Reuse one of these existing categories for the category part if it fits: ${existing.join(", ")}.\n`
      : "";
    const out = await this.complete(
      `Classify the project described below in TWO levels, as short lowercase slugs (hyphenated words).${this.docNote(
        !!docs?.length
      )}\n` +
        `Level 1 "category": the GENERIC domain or family the project belongs to — never the specific product, component or feature (firmware for a CNC controller is "cnc", not "cnc-controller-firmware"). 1-2 words, e.g. ai, engineering, gpu, devops, security.\n` +
        `Level 2 "subcategory": the specific thing it is, a few hyphenated words (e.g. cnc-controller-firmware).\n` +
        `Base your answer on what the project actually DOES (its features, the problem it solves). The project or repository name is just a label — NEVER repeat the name (or any part of it) as the category or subcategory.\n` +
        `If the text is too thin to classify confidently, reply "unknown" — do not guess.\n` +
        `${existingList}` +
        `Reply with ONLY: category/subcategory (or just the category if the subcategory is unclear), or "unknown" if it cannot be determined.\n\n${t}`,
      { maxTokens: 24, docs }
    );
    return parseCategoryPair(out);
  }

  async suggestSubcategory(text: string, category: string, docs?: AIDoc[]): Promise<string | null> {
    const t = this.clip(text, 500, 2000, !!docs?.length);
    const out = await this.complete(
      `The project described below belongs to the category "${category}".${this.docNote(
        !!docs?.length
      )}\n` +
        `Give the specific SUBCATEGORY: a short lowercase slug of a few hyphenated words describing the specific thing it is (e.g. cnc-controller-firmware — not the generic category itself, and not the project name).\n` +
        `Reply with only the subcategory, or "unknown" if it cannot be determined.\n\n${t}`,
      { maxTokens: 16, docs }
    );
    return normalizeCategory(out);
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
    return this.complete(
      `Summarize the ENTIRE content below about the project "${context}": what it is, the problem it solves, and its main features — base this on the whole content, not just the beginning.${this.docNote(
        !!docs?.length
      )}\n` +
        `Reply with ONLY ${count} bullet points, one per line, each starting with "- ". No preamble, no headings, no numbering.\n\n${t}`,
      { maxTokens: 500, docs }
    );
  }

  async ping(): Promise<string | null> {
    return this.complete("Reply with exactly one word: OK", { maxTokens: 8 });
  }
}

class NullProvider implements AIProvider {
  readonly enabled = false;
  readonly kind = "none" as const;
  async summarize(): Promise<string | null> {
    return null;
  }
  async extractGoal(): Promise<string | null> {
    return null;
  }
  async semanticMatch(): Promise<SemanticMatch | null> {
    return null;
  }
  async suggestCategory(): Promise<{ category: string; subcategory: string | null } | null> {
    return null;
  }
  async suggestSubcategory(): Promise<string | null> {
    return null;
  }
  async summarizeProject(): Promise<string | null> {
    return null;
  }
  async ping(): Promise<string | null> {
    return null;
  }
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
  if (o.match !== true) return null;

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

/** Normalize a model reply into a valid category slug (null when unusable). */
export function normalizeCategory(out: string | null): string | null {
  if (!out) return null;
  const s = out
    .trim()
    .toLowerCase()
    .replace(/["'.]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!s) return null;
  if (["unknown", "none", "n-a", "unclear", "general", "other"].includes(s)) return null;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) return null;
  return s.length > 30 ? s.slice(0, 30) : s;
}

/**
 * Parse a "category/subcategory" model reply. Missing or unusable
 * subcategory → null; unusable category → null.
 */
function parseCategoryPair(
  out: string | null
): { category: string; subcategory: string | null } | null {
  if (!out) return null;
  const clean = out.trim().toLowerCase().replace(/^["'\s]+|["'\s]+$/g, "");
  const i = clean.indexOf("/");
  const catPart = i === -1 ? clean : clean.slice(0, i);
  const subPart = i === -1 ? "" : clean.slice(i + 1);
  const category = normalizeCategory(catPart);
  if (!category) return null;
  const subcategory = subPart.trim() ? normalizeCategory(subPart) : null;
  return { category, subcategory };
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
  const state = installed.includes(model) ? "installed" : "missing";
  modelPresence.set(key, { state, at: Date.now() });
  return state;
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

  /** Ollama ≥ 0.6.2 supports the `files` RAG parameter (checked per server). */
  protected get supportsDocs(): boolean {
    return true;
  }

  protected async complete(
    prompt: string,
    opts: { maxTokens?: number; docs?: AIDoc[] } = {}
  ): Promise<string | null> {
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
      const out = (json.response ?? "").trim();
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
    if (hit && Date.now() - hit.at < RAG_PROBE_TTL_MS) return hit.ok;
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
      const out = (json.message?.content ?? "").trim();
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

class OpenAICompatibleProvider extends BaseAI {
  readonly kind = "openai" as const;
  readonly enabled = true;
  private base: string;
  private key: string;
  private model: string;

  constructor(base: string, key: string, model: string) {
    super();
    this.base = base.replace(/\/+$/, "");
    this.key = key;
    this.model = model;
  }

  /** No RAG support here — docs (if any) are ignored; BaseAI keeps the full
   *  in-prompt truncation budget. */
  protected async complete(
    prompt: string,
    opts: { maxTokens?: number; docs?: AIDoc[] } = {}
  ): Promise<string | null> {
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.key) headers.authorization = `Bearer ${this.key}`;
      const res = await fetch(`${this.base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: opts.maxTokens ?? 300,
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const out = (json.choices?.[0]?.message?.content ?? "").trim();
      return out.length > 0 ? out : null;
    } catch {
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
  protected async complete(
    prompt: string,
    opts: { maxTokens?: number; docs?: AIDoc[] } = {}
  ): Promise<string | null> {
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

  protected async complete(prompt: string, _opts?: { maxTokens?: number; docs?: AIDoc[] }): Promise<string | null> {
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

const nullProvider = new NullProvider();
let cache: { sig: string; provider: AIProvider } | null = null;

export function getAI(): AIProvider {
  const cfg = readAIConfig();
  const sig = JSON.stringify(cfg) + "|" + (userOverride() ?? "env");
  if (cache && cache.sig === sig) return cache.provider;
  const provider = effectiveEnabled(cfg) ? buildProvider(cfg) : nullProvider;
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
    pulls: Record<string, import("./ollama").PullJob>;
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
    const { ollamaSnapshot, getPullJobs } = await import("./ollama");
    const snap = await ollamaSnapshot(cfg.ollamaUrl);
    const model = cfg.model || DEFAULT_OLLAMA_MODEL;
    state.ollama = {
      reachable: snap.reachable,
      version: snap.version,
      ragSupported: !!snap.version && versionGte(snap.version, "0.6.2"),
      installed: snap.installed,
      loaded: snap.loaded,
      modelInstalled: snap.installed.includes(model),
      modelLoaded: snap.loaded.includes(model),
      pulls: getPullJobs(),
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
          "No response. Check the provider URL/key/model — and for Ollama, that the model is downloaded (see the model list below).",
      };
}
