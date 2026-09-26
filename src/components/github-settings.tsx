"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface RateStatus {
  authenticated: boolean;
  tokenSource: "settings" | "env" | null;
  limit: number | null;
  remaining: number | null;
  reset: number | null;
  updatedAt: number | null;
}

interface Status {
  set: boolean;
  masked: string;
  fromEnv: boolean;
  rateLimit: RateStatus;
}

/** "41m" / "1h 5m" / "now" from a UTC epoch-seconds reset. */
function resetIn(reset: number | null): string {
  if (!reset) return "—";
  const ms = reset * 1000 - Date.now();
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * Settings → GitHub: personal access token (60 → 5,000 req/h), live primary
 * rate-limit budget, and verification status.
 */
export default function GithubSettings() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    try {
      setStatus(await (await fetch("/api/settings/github-token")).json());
    } catch {
      // page stays usable without the values
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setStatus((await (await fetch("/api/settings/github-token")).json()) as Status);
      } catch {
        // page stays usable without the values
      }
    })();
  }, []);

  async function post(value: string, label: string) {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/github-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: body.error ?? `Failed (${res.status})` });
        return;
      }
      setMsg({ ok: true, text: value ? "Token saved and verified" : "Token cleared" });
      setToken("");
      await load();
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Request failed" });
    } finally {
      setBusy(null);
    }
  }

  const rl = status?.rateLimit;
  const budget =
    rl && rl.remaining !== null && rl.limit !== null
      ? `${rl.remaining.toLocaleString()} / ${rl.limit.toLocaleString()} requests left · resets in ${resetIn(rl.reset)}`
      : "no GitHub API requests made yet this session";

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={
            status?.masked
              ? `saved: ${status.masked} — paste to replace`
              : "Personal access token (ghp_…)"
          }
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-72 rounded border border-white/15 bg-white/5 px-2 py-1 text-slate-200"
        />
        <button
          onClick={() => token.trim() && post(token, "save")}
          disabled={busy !== null || !token.trim()}
          className="btn-ghost px-2.5 py-1 text-xs"
        >
          {busy === "save" ? "Verifying…" : "Save"}
        </button>
        {status?.set && (
          <button
            onClick={() => post("", "clear")}
            disabled={busy !== null}
            className="btn-ghost px-2.5 py-1 text-xs"
          >
            {busy === "clear" ? "Clearing…" : "Clear"}
          </button>
        )}
      </div>
      {msg && (
        <p className={`text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}

      {rl && (
        <div className="space-y-1">
          {rl.authenticated ? (
            <p className="text-emerald-400">
              ✓ Authenticated — 5,000 req/h budget
              {rl.tokenSource && (
                <span className="text-slate-500">
                  {" "}
                  (token from {rl.tokenSource === "settings" ? "Settings" : "GITHUB_TOKEN env"})
                </span>
              )}
            </p>
          ) : (
            <p className="text-amber-400">
              ⚠ Unauthenticated — 60 req/h per IP. Save a token above (no scopes needed
              for public repos) for 5,000 req/h.
            </p>
          )}
          <p className="text-xs text-slate-500">Budget: {budget}</p>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Create a token at github.com → Settings → Developer settings → Personal access
        tokens (fine-grained or classic, no scopes needed to read public repos). When the
        budget runs out, requests wait until the window resets instead of failing.
      </p>
    </div>
  );
}