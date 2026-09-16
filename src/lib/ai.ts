/**
 * AI provider seam.
 *
 * Providers (selected in Settings or via env):
 *   - Ollama: local tiny models (qwen2.5:1.5b default); the model is loaded
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
import { ollamaInstalled, startPull } from "./ollama";

export type ProviderKind = "ollama" | "openai" | "anthropic" | "mcp";

export interface AIProvider {
  readonly enabled: boolean;
  readonly kind: ProviderKind | "none";
  /** Summarize a diff/changes for a project. */
  summarize(diff: string, context: string): Promise<string | null>;
  /** One-line goal/purpose of software described by text. */
  extractGoal(htmlText: string): Promise<string | null>;
  /** Does this text semantically relate to any of the keywords? */
  semanticallyMatches(text: string, keywords: string[]): Promise<boolean | null>;
  /** Summarize what a whole project/software is. */
  summarizeProject(text: string, context: string): Promise<string | null>;
  /** Connectivity probe — returns the model's reply to a trivial prompt. */
  ping(): Promise<string | null>;
}

/** Shared prompt-building on top of a raw text completion. */
abstract class BaseAI implements AIProvider {
  abstract readonly kind: ProviderKind;
  abstract readonly enabled: boolean;
  protected abstract complete(
    prompt: string,
    opts?: { maxTokens?: number }
  ): Promise<string | null>;

  async summarize(diff: string, context: string): Promise<string | null> {
    const d = diff.length > 4000 ? diff.slice(0, 4000) : diff;
    return this.complete(
      `Summarize these changes to the project "${context}" in one or two plain sentences. No preamble.\n\n${d}`,
      { maxTokens: 300 }
    );
  }

  async extractGoal(htmlText: string): Promise<string | null> {
    const t = htmlText.length > 3000 ? htmlText.slice(0, 3000) : htmlText;
    return this.complete(
      `In one sentence (max 25 words), what is the main goal/purpose of the software described below?\n\n${t}`,
      { maxTokens: 120 }
    );
  }

  async semanticallyMatches(text: string, keywords: string[]): Promise<boolean | null> {
    const t = text.length > 3000 ? text.slice(0, 3000) : text;
    const out = await this.complete(
      `Does the following text relate to any of these topics: ${keywords.join(
        ", "
      )}? Answer with a single word: yes or no.\n\n${t}`,
      { maxTokens: 8 }
    );
    if (!out) return null;
    if (/^yes\b/i.test(out)) return true;
    if (/^no\b/i.test(out)) return false;
    return null;
  }

  async summarizeProject(text: string, context: string): Promise<string | null> {
    const t = text.length > 5000 ? text.slice(0, 5000) : text;
    return this.complete(
      `In 2-3 plain sentences, summarize what the project "${context}" is and what it does. No preamble, no lists.\n\n${t}`,
      { maxTokens: 300 }
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
  async semanticallyMatches(): Promise<boolean | null> {
    return null;
  }
  async summarizeProject(): Promise<string | null> {
    return null;
  }
  async ping(): Promise<string | null> {
    return null;
  }
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

  protected async complete(
    prompt: string,
    opts: { maxTokens?: number } = {}
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

  protected async complete(
    prompt: string,
    opts: { maxTokens?: number } = {}
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

  protected async complete(
    prompt: string,
    opts: { maxTokens?: number } = {}
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

  protected async complete(prompt: string): Promise<string | null> {
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
    model: process.env.OLLAMA_MODEL || "qwen2.5:1.5b",
    ollamaUrl: process.env.OLLAMA_URL || "",
    openaiUrl: process.env.OPENAI_URL || "https://api.openai.com/v1",
    openaiKey: process.env.OPENAI_API_KEY || "",
    anthropicKey: process.env.ANTHROPIC_API_KEY || "",
    mcpUrl: process.env.MCP_URL || "",
    mcpTool: "",
    mcpArg: "",
    ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE || "5",
  };
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
  } catch {
    // DB not ready yet — env defaults only
  }
  return cfg;
}

export function saveAIConfig(
  patch: Partial<AIConfig> & { enabled?: "on" | "off" | null }
): void {
  const d = getDb();
  for (const k of CONFIG_KEYS) {
    const v = patch[k];
    if (v !== undefined) setSetting(d, `ai.${k}`, v === "" ? null : String(v));
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
      return new OllamaProvider(cfg.ollamaUrl, cfg.model || "qwen2.5:1.5b", cfg.ollamaKeepAlive);
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
      // 401/403 (bad key) or a dead host → yellow.
      const base = cfg.openaiUrl.replace(/\/+$/, "");
      const r = await fetch(`${base}/models`, {
        headers: cfg.openaiKey ? { authorization: `Bearer ${cfg.openaiKey}` } : undefined,
        signal: AbortSignal.timeout(4000),
      });
      ok = r.status === 200;
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
    const model = cfg.model || "qwen2.5:1.5b";
    state.ollama = {
      reachable: snap.reachable,
      version: snap.version,
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
