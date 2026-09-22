"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AIState } from "@/lib/ai";
import { deriveAiStatus, DEFAULT_OLLAMA_MODEL } from "@/lib/ai-status";

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
  accuracy: "power" | "high" | "mid" | "low";
  hint: { label: string; tone: "good" | "ok" | "bad" };
  /** The default model — the only one that auto-downloads on first AI use. */
  isDefault: boolean;
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

/** Model list sections — highest accuracy on top. */
const ACCURACY_GROUPS: { key: "power" | "high" | "mid" | "low"; label: string }[] = [
  { key: "power", label: "Power (high RAM)" },
  { key: "high", label: "High accuracy" },
  { key: "mid", label: "Mid accuracy" },
  { key: "low", label: "Low accuracy" },
];

/** Terminal line coloring: errors red, warnings amber, everything else dim. */
function logLineClass(line: string): string {
  if (/error|fatal|panic|failed/i.test(line)) return "text-rose-400";
  if (/warn|deprecat/i.test(line)) return "text-amber-300";
  return "text-emerald-200/70";
}

/**
 * Terminal-style tail of the bundled Docker Ollama server log. Polls
 * GET /api/ai/ollama/logs every 5 s, follows new lines, color-codes
 * error/warning lines. Shows an explanatory note on standalone installs,
 * where the server log lives on that other machine (lines === null).
 */
function OllamaLogPanel() {
  const [lines, setLines] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sizeKB, setSizeKB] = useState(0);
  const [loading, setLoading] = useState(false);
  const cleared = useRef(false);
  const seenCount = useRef(0);
  const preRef = useRef<HTMLPreElement | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setLoading(true);
    try {
      const r = await fetch("/api/ai/ollama/logs?lines=400", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as
        | { ok: boolean; lines: string[] | null; note: string | null; sizeKB: number }
        | null;
      if (!j) return;
      setNote(j.note ?? null);
      setSizeKB(j.sizeKB ?? 0);
      if (j.lines !== null) {
        if (cleared.current) {
          // Keep the panel cleared until log lines written AFTER the clear
          // arrive (slice past the point the user cleared).
          setLines(j.lines.length > seenCount.current ? j.lines.slice(seenCount.current) : []);
        } else {
          setLines(j.lines);
        }
        seenCount.current = j.lines.length;
      } else {
        setLines(null);
      }
    } finally {
      if (manual) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer the first fetch out of the effect body (avoids a synchronous
    // setState in the effect); the interval would pick it up within 5 s.
    const t = setTimeout(() => void load(), 0);
    const iv = setInterval(() => {
      if (document.hidden) return; // no polling in hidden tabs
      void load();
    }, 5000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [load]);

  // Follow the tail: stay pinned to the bottom unless the user scrolled up.
  useEffect(() => {
    const el = preRef.current;
    if (!el || !lines) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const clear = () => {
    cleared.current = true;
    setLines([]);
  };

  return (
    <div className="space-y-1.5 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-200">
          Ollama server log
          {note === null && sizeKB > 0 && (
            <span className="ml-2 text-[11px] font-normal text-slate-500">{sizeKB} KB on disk</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
            title="Reload the log now"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={clear}
            disabled={lines === null}
            className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
            title="Clear the panel — log lines written after the clear will appear as they arrive"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/60 p-3">
        {note !== null ? (
          <p className="text-[11px] leading-relaxed text-amber-300">{note}</p>
        ) : lines === null ? (
          <p className="text-[11px] text-slate-500">Loading server log…</p>
        ) : (
          <pre
            ref={preRef}
            className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed"
          >
            {lines.length === 0 ? (
              <span className="text-slate-500">(cleared — new log lines will appear here)</span>
            ) : (
              lines.map((l, i) => (
                <div key={i} className={logLineClass(l)}>
                  {l}
                </div>
              ))
            )}
          </pre>
        )}
      </div>
      <p className="text-[10px] text-slate-500">
        Live tail of the bundled Docker Ollama server (polls every 5 s, shows up to the last 400
        lines). Red = errors, amber = warnings.
      </p>
    </div>
  );
}

export default function AISettings({ initial, initialConfig, catalog, authEnabled }: Props) {
  const [s, setS] = useState<AIState>(initial);
  const [form, setForm] = useState<AIFormConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [unloading, setUnloading] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; reply: string | null; error: string | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detect, setDetect] = useState<{ ok: boolean; url: string | null; version: string | null } | null>(null);

  const refresh = useCallback(async () => {
    const j = await fetch("/api/ai").then((r) => r.json()).catch(() => null);
    if (j) setS(j);
  }, []);

  const hasActivePull =
    !!s.ollama && Object.values(s.ollama.pulls).some((p) => p.status === "downloading");
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.hidden) return; // no hidden-tab polling (visibilitychange reloads)
      refresh();
    }, hasActivePull ? 2000 : 20000);
    // Re-check immediately when the tab becomes visible again (e.g. the
    // user came back from another tab — a download may have finished).
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [s, hasActivePull, refresh]);

  const post = (path: string, body: unknown) =>
    fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  /** Probe the well-known Ollama endpoints and report the first that answers. */
  const doDetect = useCallback(async (preferred: string) => {
    setDetecting(true);
    setDetect(null);
    try {
      const r = await fetch("/api/ai/ollama/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: preferred }),
      });
      const j = (await r.json()) as
        | { ok: boolean; url: string | null; version: string | null }
        | null;
      if (j) setDetect(j);
    } catch {
      // could not reach the app server itself — the guidance box stays
    }
    setDetecting(false);
  }, []);

  // On open: if the Ollama connection is broken, look for the server once so
  // the user doesn't have to figure out the address themselves.
  const didAutoDetect = useRef(false);
  useEffect(() => {
    if (didAutoDetect.current) return;
    didAutoDetect.current = true;
    if (initial.provider !== "ollama" || initial.ollama?.reachable === true) return;
    const t = setTimeout(() => void doDetect(initialConfig.ollamaUrl), 0);
    return () => clearTimeout(t);
  }, [initial, initialConfig, doDetect]);

  /** One click: point the app at the detected address and save. */
  const useDetected = async () => {
    if (!detect?.url) return;
    const next = { ...form, ollamaUrl: detect.url };
    setForm(next);
    const r = await post("/api/ai", next);
    if (r.ok) setMsg("Saved — Ollama connection now points at the detected address.");
    setDetect(null);
    refresh();
  };

  // The switch represents the user's *intent* (the ai.enabled override), not
  // the effective state — so it always flips visibly, even before a provider
  // is configured (which is what made it look stuck before).
  const intentOn = s.userOverride !== "off";
  const toggle = async () => {
    setMsg(null);
    await post("/api/ai", { enabled: intentOn ? "off" : "on" });
    refresh();
  };
  // The status light uses the EXACT same logic as the topbar badge
  // (deriveAiStatus, src/lib/ai-status.ts): green only after a live check
  // passed, pulsing sky while a model downloads, amber when offline / model
  // missing or broken / engine errors, slate when off.
  const d = deriveAiStatus(s);
  const remoteOnline = s.enabled && s.provider !== "ollama" && s.reachable === true;
  const remoteOffline = s.enabled && s.provider !== "ollama" && s.reachable === false;
  const remoteChecking = s.enabled && s.provider !== "ollama" && s.reachable == null;

  // Per-connection annotation for the status line ("" when nothing to say).
  const connNote = (() => {
    if (s.provider === "ollama") {
      if (!s.ollama) return "";
      if (!s.ollama.reachable) return " · not connected (Ollama unreachable)";
      if (!s.ollama.modelInstalled) return " · connected (model not downloaded)";
      return s.ollama.modelLoaded
        ? " · connected (model loaded)"
        : " · connected (model installed — in standby, loads on next AI call)";
    }
    if (remoteOffline) return " · not connected (check URL / key)";
    if (remoteChecking) return " · checking connection…";
    if (remoteOnline) return " · connected";
    return "";
  })();

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

  const deleteModel = async (name: string) => {
    const isCurrent = s.model === name;
    const autoPull = name.trim().toLowerCase() === DEFAULT_OLLAMA_MODEL.toLowerCase();
    const ok = window.confirm(
      isCurrent
        ? autoPull
          ? `Delete ${name}?\n\nIt is the currently selected model — AI will fall back to heuristics until it is downloaded again (the download starts automatically on the next AI use).`
          : `Delete ${name}?\n\nIt is the currently selected model — AI will fall back to heuristics until you download it again from this list (only the default model, ${DEFAULT_OLLAMA_MODEL}, downloads automatically).`
        : `Delete ${name} from Ollama?\n\nThe downloaded weights will be removed from disk.`
    );
    if (!ok) return;
    setMsg(null);
    setDeleting(name);
    try {
      const r = await post("/api/ai/ollama/delete", { name });
      const j = await r.json().catch(() => ({} as { error?: string }));
      if (!r.ok) setMsg(j.error ?? `Failed to delete ${name}`);
      else setMsg(`${name} deleted.`);
      refresh();
    } catch {
      setMsg("Delete failed (could not reach the app server).");
    } finally {
      setDeleting(null);
    }
  };

  const unloadModel = async (name: string) => {
    setMsg(null);
    setUnloading(name);
    try {
      const r = await post("/api/ai/ollama/unload", { name });
      const j = await r.json().catch(() => ({} as { error?: string }));
      if (!r.ok) setMsg(j.error ?? `Failed to unload ${name}`);
      else
        setMsg(
          `${name} unloaded from memory (RAM freed) — it is still installed and reloads automatically on the next AI call.`
        );
      refresh();
    } catch {
      setMsg("Unload failed (could not reach the app server).");
    } finally {
      setUnloading(null);
    }
  };

  const deleteAllAndReset = async () => {
    const names = s.ollama?.installed ?? [];
    if (names.length === 0) {
      setMsg("No installed models to delete.");
      return;
    }
    const ok = window.confirm(
      `Delete ALL ${names.length} installed Ollama model(s) and reset AI?\n\n${names.join(
        "\n"
      )}\n\nThis frees the disk space and the model selection goes back to the default (${DEFAULT_OLLAMA_MODEL}), which is downloaded automatically on the next AI use.`
    );
    if (!ok) return;
    setMsg(null);
    setDeleting("all");
    const failed: string[] = [];
    for (const name of names) {
      try {
        const r = await post("/api/ai/ollama/delete", { name });
        const j = await r.json().catch(() => ({} as { error?: string }));
        if (!r.ok) failed.push(`${name}: ${j.error ?? "failed"}`);
      } catch {
        failed.push(name);
      }
    }
    // Start AI over: model selection back to the default (Ollama provider only).
    if (form.provider === "ollama" && form.model !== DEFAULT_OLLAMA_MODEL) {
      const next = { ...form, model: DEFAULT_OLLAMA_MODEL };
      setForm(next);
      await post("/api/ai", next);
    }
    setMsg(
      failed.length
        ? `Deleted ${names.length - failed.length} of ${names.length} model(s). Failed: ${failed.join("; ")}`
        : `All models deleted and AI reset — the default model (${DEFAULT_OLLAMA_MODEL}) downloads automatically on the next AI use.`
    );
    refresh();
    setDeleting(null);
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
          className={`h-2.5 w-2.5 rounded-full ${d.dot}${
            d.dot.includes("bg-emerald") ? " shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]" : ""
          }`}
          title={d.title}
          aria-hidden="true"
        />
        <p className="text-sm text-slate-300" title={d.title}>
          {d.label}
          {s.enabled ? ` — ${s.provider}${s.model ? ` · ${s.model}` : ""}${connNote}` : ""}
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
          No provider configured yet — fill in the fields below (Anthropic needs an API key,
          MCP a server URL) and press Save. Ollama is pre-filled with the default address.
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
            form.provider === "ollama" ? DEFAULT_OLLAMA_MODEL : "gpt-4o-mini / claude-haiku-4-5",
          )}
        {form.provider === "ollama" && (
          <div className="space-y-1.5">
            {field("Ollama base URL", "ollamaUrl", "http://ollama:11434")}
            <button
              onClick={() => doDetect(form.ollamaUrl)}
              disabled={detecting}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
              title="Probe the common Ollama endpoints (bundled compose service, local loopback, Docker host) and offer the first one that answers"
            >
              {detecting ? "Detecting Ollama…" : "Detect Ollama address"}
            </button>
          </div>
        )}
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-slate-200">Ollama models</h3>
            {s.ollama && s.ollama.installed.length > 0 && (
              <button
                onClick={deleteAllAndReset}
                disabled={deleting !== null}
                className="rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-[11px] text-rose-300 transition hover:bg-rose-400/20 disabled:opacity-50"
                title="Delete every installed Ollama model and reset the model selection to the default (qwen3.5:4b)"
              >
                {deleting === "all"
                  ? "Deleting all…"
                  : `Delete all models & reset AI (${s.ollama.installed.length})`}
              </button>
            )}
          </div>
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
              {detecting ? (
                <p className="font-medium">Looking for an Ollama server…</p>
              ) : detect?.ok ? (
                <>
                  <p className="font-medium">
                    Found Ollama at {detect.url}
                    {detect.version ? ` (v${detect.version})` : ""}.
                  </p>
                  {detect.url !== form.ollamaUrl && (
                    <button
                      onClick={useDetected}
                      className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-300 transition hover:bg-emerald-400/20"
                    >
                      Use {detect.url}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="font-medium">
                    Ollama is not reachable at {form.ollamaUrl || "the configured address"} —
                    the Download buttons need it (Ollama fetches the model from the official
                    registry, registry.ollama.ai).
                  </p>
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>
                      Running in Docker? Make sure the <code>ollama</code> service from{" "}
                      <code>docker-compose.yml</code> is up in your stack — the default address{" "}
                      <code>http://ollama:11434</code> then works without any further setup.
                    </li>
                    <li>
                      Ollama on the Docker host or another machine? Enter its address above —{" "}
                      <code>http://host.docker.internal:11434</code> on macOS/Windows Docker,{" "}
                      <code>http://{`<host-ip>`}:11434</code> elsewhere — then press Save.
                    </li>
                    <li>
                      Or install Ollama on the machine the app runs on (
                      <a
                        href="https://ollama.com/download"
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-white"
                      >
                        ollama.com/download
                      </a>
                      ), start it, and press{" "}
                      <span className="font-medium">Detect Ollama address</span> again.
                    </li>
                  </ol>
                </>
              )}
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
              {" · "}
              {s.ollama.ragSupported ? (
                <span className="text-emerald-300" title="The server chunks, embeds and retrieves from project pages/READMEs, so the model sees the most relevant parts of long documents">
                  RAG ready
                </span>
              ) : (
                <span
                  className="text-amber-300"
                  title="Built-in RAG (full README/page analysis) needs Ollama ≥ 0.6.2 — long documents are truncated into the prompt instead. Upgrade with: ollama update"
                >
                  RAG off (Ollama &lt; 0.6.2)
                </span>
              )}
              . Models load into memory on first use.
            </p>
          )}
          {ACCURACY_GROUPS.map((g) => {
            const models = catalog.filter((m) => m.accuracy === g.key);
            if (models.length === 0) return null;
            return (
              <div key={g.key} className="space-y-1.5 pt-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  {g.label}
                </p>
                <ul className="space-y-1.5">
                  {models.map((m) => {
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
                        {m.isDefault && (
                          <span
                            className="badge border-violet-400/40 bg-violet-400/10 text-violet-300"
                            title={`Default model — the ONLY model that downloads automatically (on the next AI use). Every other model must be downloaded manually from this list.`}
                          >
                            default
                          </span>
                        )}
                        <span className="text-slate-500">
                          {m.family} · {m.params} · {m.ctx} ctx · ~{m.q4GB} GB
                        </span>
                        {m.isDefault && !installing && !loaded && (
                          <span className="text-[10px] text-slate-500">
                            downloads automatically on the next AI use
                          </span>
                        )}
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
                        {loaded && (
                          <button
                            onClick={() => unloadModel(m.name)}
                            disabled={unloading === m.name}
                            className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[11px] text-sky-300 transition hover:bg-sky-400/20 disabled:opacity-50"
                            title="Free RAM — removes the model from memory but keeps it installed; it reloads automatically on the next AI call"
                          >
                            {unloading === m.name ? "Unloading…" : "Unload"}
                          </button>
                        )}
                        {(installing || loaded) && (
                          <button
                            onClick={() => deleteModel(m.name)}
                            disabled={deleting === m.name}
                            className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-[11px] text-rose-300 transition hover:bg-rose-400/20 disabled:opacity-50"
                            title="Delete this model from Ollama (frees disk space)"
                          >
                            {deleting === m.name ? "Deleting…" : "Delete"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          <p className="text-[11px] leading-relaxed text-slate-500">
            Click a model name to select it (then press Save). Hardware hints are based on this
            server&rsquo;s system RAM — GPU/VRAM usage is up to Ollama to manage. If AI is
            enabled and the selected model is missing, only the default model (
            {DEFAULT_OLLAMA_MODEL}) downloads automatically on the next AI use — every other
            model must be downloaded from this list (press Download for it).
          </p>
          <OllamaLogPanel />
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