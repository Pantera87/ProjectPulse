"use client";

import { useCallback, useEffect, useState } from "react";
import type { AIState } from "@/lib/ai";

export interface AIFormConfig {
  provider: string;
  model: string;
  ollamaUrl: string;
  openaiUrl: string;
  openaiKey: string;
  anthropicKey: string;
  mcpUrl: string;
  mcpTool: string;
  mcpArg: string;
  ollamaKeepAlive: string;
}

export interface CatalogRow {
  name: string;
  family: string;
  params: string;
  q4GB: number;
  ctx: string;
  blurb: string;
  hint: { label: string; tone: "good" | "ok" | "bad" };
}

interface Props {
  initial: AIState;
  initialConfig: AIFormConfig;
  catalog: CatalogRow[];
  authEnabled: boolean;
}

const TONE: Record<string, string> = {
  good: "text-emerald-300",
  ok: "text-sky-300",
  bad: "text-amber-300",
};

export default function AISettings({ initial, initialConfig, catalog, authEnabled }: Props) {
  const [s, setS] = useState<AIState>(initial);
  const [form, setForm] = useState<AIFormConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; reply: string | null; error: string | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const j = await fetch("/api/ai").then((r) => r.json()).catch(() => null);
    if (j) setS(j);
  }, []);

  const hasActivePull =
    !!s.ollama && Object.values(s.ollama.pulls).some((p) => p.status === "downloading");
  useEffect(() => {
    const iv = setInterval(refresh, hasActivePull ? 2000 : 20000);
    return () => clearInterval(iv);
  }, [s, hasActivePull, refresh]);

  const post = (path: string, body: unknown) =>
    fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  // The switch represents the user's *intent* (the ai.enabled override), not
  // the effective state — so it always flips visibly, even before a provider
  // is configured (which is what made it look stuck before).
  const intentOn = s.userOverride !== "off";
  const toggle = async () => {
    setMsg(null);
    await post("/api/ai", { enabled: intentOn ? "off" : "on" });
    refresh();
  };
  // Remote providers (openai/anthropic/mcp): dot + text reflect whether the
  // endpoint answered the last reachability check (green) or not (yellow).
  const remoteOnline =
    s.enabled && s.provider !== "ollama" && s.reachable !== false;
  const remoteOffline = s.enabled && s.provider !== "ollama" && s.reachable === false;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const r = await post("/api/ai", form);
    if (r.ok) setMsg("Saved.");
    setSaving(false);
    refresh();
  };

  const doTest = async () => {
    setTest(null);
    setMsg(null);
    const r = await post("/api/ai/test", {});
    setTest(await r.json().catch(() => ({ ok: false, reply: null, error: "Test failed" })));
  };

  const download = async (name: string) => {
    setMsg(null);
    try {
      const r = await post("/api/ai/ollama/pull", { name });
      const j = await r.json().catch(() => ({} as { error?: string }));
      if (!r.ok) setMsg(j.error ?? "Download failed to start");
      else setMsg(`Download of ${name} started — progress appears in the model list below.`);
      refresh();
    } catch {
      setMsg("Download failed to start (could not reach the app server).");
    }
  };

  const field = (label: string, key: keyof AIFormConfig, placeholder: string, type = "text") => (
    <label className="block text-xs text-slate-400">
      {label}
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-slate-200 outline-none focus:border-violet-400/50"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      {/* status + toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            remoteOnline
              ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]"
              : intentOn || remoteOffline
                ? "bg-amber-400"
                : "bg-slate-500"
          }`}
          aria-hidden="true"
        />
        <p className="text-sm text-slate-300">
          {s.envOff
            ? "AI is disabled by the AI_ENABLED=false environment variable."
            : !intentOn
              ? "AI is disabled (Settings toggle)."
              : s.enabled
                ? `AI is on — ${s.provider}${s.model ? ` · ${s.model}` : ""}${
                    s.provider !== "ollama"
                      ? remoteOffline
                        ? " · not connected (check URL / key)"
                        : " · connected"
                      : ""
                  }`
                : "AI is enabled — no provider configured yet."}
        </p>
        <button
          role="switch"
          aria-checked={intentOn}
          onClick={toggle}
          className={`relative ml-auto h-5 w-9 rounded-full transition ${
            intentOn ? "bg-emerald-500/80" : "bg-white/15"
          }`}
          title={intentOn ? "Disable AI" : "Enable AI"}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              intentOn ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {intentOn && !s.configured && (
        <p className="text-xs text-amber-300">
          No provider configured yet — fill in the fields below (Ollama needs a base URL,
          Anthropic an API key, MCP a server URL) and press Save.
        </p>
      )}

      {/* provider form */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-400">
          Provider
          <select
            value={form.provider}
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-slate-200 outline-none focus:border-violet-400/50"
          >
            <option value="ollama">Ollama (local models)</option>
            <option value="openai">OpenAI-compatible (OpenAI, LM Studio, vLLM…)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="mcp">MCP server (remote machine with local AI)</option>
          </select>
        </label>
        {form.provider !== "mcp" &&
          field(
            "Model",
            "model",
            form.provider === "ollama" ? "qwen2.5:1.5b" : "gpt-4o-mini / claude-haiku-4-5",
          )}
        {form.provider === "ollama" &&
          field("Ollama base URL", "ollamaUrl", "http://localhost:11434")}
        {form.provider === "openai" &&
          field("API base URL", "openaiUrl", "https://api.openai.com/v1")}
        {form.provider === "openai" &&
          field("API key", "openaiKey", "sk-… (blank for local servers)", "password")}
        {form.provider === "anthropic" &&
          field("Anthropic API key", "anthropicKey", "sk-ant-…", "password")}
        {form.provider === "mcp" &&
          field("MCP server URL (Streamable HTTP)", "mcpUrl", "http://host:port/mcp")}
        {form.provider === "mcp" &&
          field("Tool name (blank = auto-detect)", "mcpTool", "e.g. generate_text")}
        {form.provider === "mcp" &&
          field("Tool argument name (blank = auto-detect)", "mcpArg", "e.g. prompt")}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-violet-500/80 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={doTest}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
        >
          Test connection
        </button>
        {msg && <span className="max-w-lg break-words text-xs text-slate-400">{msg}</span>}
      </div>

      {test && (
        <p
          className={`rounded-lg border px-3 py-2 text-xs ${
            test.ok
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-rose-400/30 bg-rose-400/10 text-rose-300"
          }`}
        >
          {test.ok ? `Reply: ${test.reply}` : test.error}
        </p>
      )}

      {/* Ollama model manager */}
      {form.provider === "ollama" && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-200">Ollama models</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs text-slate-400">
              Auto-unload model after
              <select
                value={form.ollamaKeepAlive}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ollamaKeepAlive: e.target.value }))
                }
                className="mt-1 w-48 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-slate-200 outline-none focus:border-violet-400/50"
              >
                <option value="1">1 minute</option>
                <option value="5">5 minutes (default)</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="never">Keep loaded until restart</option>
              </select>
            </label>
            <p className="max-w-md text-[11px] text-slate-500">
              Ollama keeps the model in memory for this long after each AI call, then frees
              the RAM. Press Save to apply.
            </p>
          </div>
          {(!s.ollama || !s.ollama.reachable) && (
            <div className="space-y-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              <p className="font-medium">
                Ollama is not reachable at {form.ollamaUrl || "http://localhost:11434"} — the
                Download buttons need it (Ollama fetches the model from the official registry,
                registry.ollama.ai).
              </p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>
                  Install Ollama:{" "}
                  <a
                    href="https://ollama.com/download"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-white"
                  >
                    ollama.com/download
                  </a>{" "}
                  (Windows terminal: <code>winget install Ollama.Ollama</code>)
                </li>
                <li>
                  Start it — after install it runs in the system tray; from a terminal:{" "}
                  <code>ollama serve</code>
                </li>
                <li>
                  Press Save (with the URL), then Download again. Manual alternative:{" "}
                  <code>ollama pull qwen2.5:1.5b</code>
                </li>
              </ol>
            </div>
          )}
          {s.ollama && s.ollama.reachable && (
            <p className="text-xs text-slate-400">
              Server {s.ollama.version ? `v${s.ollama.version} · ` : ""}
              {s.ollama.installed.length} model
              {s.ollama.installed.length === 1 ? "" : "s"} installed
              {s.ollama.loaded.length > 0 && (
                <>
                  {" · "}
                  <span className="text-emerald-300">
                    loaded now: {s.ollama.loaded.join(", ")}
                  </span>
                </>
              )}
              . Models load into memory on first use.
            </p>
          )}
          <ul className="space-y-1.5">
            {catalog.map((m) => {
              const pull = s.ollama?.pulls?.[m.name];
              const installing = s.ollama?.installed.includes(m.name);
              const loaded = s.ollama?.loaded.includes(m.name);
              const isCurrent = form.model === m.name;
              return (
                <li
                  key={m.name}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs"
                >
                  <button
                    onClick={() => setForm((f) => ({ ...f, model: m.name }))}
                    className={`min-w-[140px] text-left font-medium ${
                      isCurrent ? "text-violet-300" : "text-slate-200 hover:text-white"
                    }`}
                    title="Use this model"
                  >
                    {m.name}
                    {isCurrent && <span className="ml-1 text-violet-300">●</span>}
                  </button>
                  <span className="text-slate-500">
                    {m.family} · {m.params} · {m.ctx} ctx · ~{m.q4GB} GB
                  </span>
                  {loaded ? (
                    <span className="badge border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
                      loaded
                    </span>
                  ) : installing ? (
                    <span className="badge border-sky-400/40 bg-sky-400/10 text-sky-300">
                      installed
                    </span>
                  ) : null}
                  {pull && pull.status === "downloading" && (
                    <span className="badge animate-pulse border-sky-400/40 bg-sky-400/10 text-sky-300">
                      downloading {Math.round(pull.progress * 100)}%
                    </span>
                  )}
                  {pull && pull.status === "error" && (
                    <span className="badge border-rose-400/40 bg-rose-400/10 text-rose-300" title={pull.error ?? ""}>
                      download failed
                    </span>
                  )}
                  <span className={`ml-auto max-w-[45%] text-[11px] ${TONE[m.hint.tone]}`}>
                    {m.hint.label}
                  </span>
                  {!installing && !loaded && (
                    <button
                      onClick={() => download(m.name)}
                      disabled={pull?.status === "downloading"}
                      className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                    >
                      {pull?.status === "downloading" ? "Downloading…" : "Download"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Click a model name to select it (then press Save). Hardware hints are based on this
            server&rsquo;s system RAM — GPU/VRAM usage is up to Ollama to manage. If AI is
            enabled and the selected model is missing, ProjectPulse starts the download
            automatically the next time AI is used.
          </p>
        </div>
      )}

      {/* security note */}
      {authEnabled === false && (form.openaiKey || form.anthropicKey) && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          API keys are stored in the app database and sent to the provider server. Without a
          shared password (AUTH_PASSWORD) anyone with network access can read this settings
          page and use the key. Set AUTH_PASSWORD if the app is reachable beyond localhost.
        </p>
      )}
    </div>
  );
}