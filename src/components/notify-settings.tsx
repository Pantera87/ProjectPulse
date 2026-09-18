"use client";

import { useState } from "react";
import type { ChannelType, NotifyChannel, NotifyLogRow } from "@/lib/notifiers";
import Time from "./time";

interface Props {
  initialChannels: NotifyChannel[];
  initialLog: NotifyLogRow[];
  authEnabled: boolean;
}

const TYPE_LABEL: Record<ChannelType, string> = {
  webhook: "Webhook",
  ntfy: "ntfy (push)",
  telegram: "Telegram",
  email: "Email (SMTP)",
};

const HINTS: Record<ChannelType, string> = {
  webhook: "Any endpoint that accepts a JSON POST — no account needed.",
  ntfy: "No account needed — pick a topic name and it appears in any ntfy app on your phone.",
  telegram: "Create a bot with @BotFather (/newbot), paste its token and your chat id below.",
  email: "Any SMTP provider works (Gmail app password, Outlook, …).",
};

const KINDS = [
  "content_change",
  "release",
  "readme",
  "commit",
  "milestone",
  "issue",
  "feed_entry",
  "keyword",
] as const;

export default function NotifySettings({ initialChannels, initialLog, authEnabled }: Props) {
  const [channels, setChannels] = useState<NotifyChannel[]>(initialChannels);
  const [log, setLog] = useState<NotifyLogRow[]>(initialLog);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const update = (id: string, patch: Partial<NotifyChannel>) =>
    setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const add = (type: ChannelType) => {
    setChannels((cs) => [
      ...cs,
      {
        id: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        name: TYPE_LABEL[type],
        enabled: true,
        minPriority: "normal",
        kinds: [],
        url: type === "webhook" ? "" : type === "ntfy" ? "https://ntfy.sh" : undefined,
      },
    ]);
  };

  const remove = (id: string) => setChannels((cs) => cs.filter((c) => c.id !== id));

  const doTest = async (ch: NotifyChannel) => {
    setTestState((t) => ({ ...t, [ch.id]: { ok: false, msg: "Sending…" } }));
    const r = await fetch("/api/notify/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: ch }),
    }).catch(() => null);
    const j = ((await r?.json().catch(() => null)) ?? null) as
      | { ok?: boolean; error?: string }
      | null;
    setTestState((t) => ({
      ...t,
      [ch.id]: {
        ok: !!j?.ok,
        msg: j?.ok ? "Delivered — check your device / inbox." : j?.error ?? "Request failed",
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const r = await fetch("/api/notify/channels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channels }),
    }).catch(() => null);
    const j = ((await r?.json().catch(() => null)) ?? null) as
      | { ok?: boolean; error?: string; channels?: NotifyChannel[]; log?: NotifyLogRow[] }
      | null;
    setSaving(false);
    if (!j?.ok) {
      setError(j?.error ?? "Save failed");
      return;
    }
    if (j.channels) setChannels(j.channels);
    if (j.log) setLog(j.log);
  };

  const toggleKind = (ch: NotifyChannel, k: (typeof KINDS)[number]) => {
    const has = (ch.kinds as readonly string[]).includes(k);
    update(ch.id, {
      kinds: (has
        ? (ch.kinds as string[]).filter((x) => x !== k)
        : [...(ch.kinds ?? []), k]) as NotifyChannel["kinds"],
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Choose how you want to be notified — every new update is delivered to all enabled
        channels below. Webhook and ntfy need no account.
      </p>

      {!authEnabled && channels.length > 0 && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          Tokens and SMTP passwords are stored in the app database. Without a shared password
          (AUTH_PASSWORD) anyone with network access can read this page.
        </p>
      )}

      {/* add channel */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-500">Add channel</span>
        {(Object.keys(TYPE_LABEL) as ChannelType[]).map((t) => (
          <button key={t} onClick={() => add(t)} className="chip" title={HINTS[t]}>
            + {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {channels.length === 0 && (
        <p className="text-sm text-slate-500">No channels yet — add one above.</p>
      )}

      {channels.map((ch) => (
        <div key={ch.id} className="glass-strong space-y-3 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge border-violet-400/30 bg-violet-400/10 text-violet-300">
              {ch.type}
            </span>
            <input
              value={ch.name}
              onChange={(e) => update(ch.id, { name: e.target.value })}
              className="input-glass w-40 text-sm"
              placeholder="Name"
            />
            <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={ch.enabled}
                onChange={(e) => update(ch.id, { enabled: e.target.checked })}
              />
              enabled
            </label>
            <button
              onClick={() => doTest(ch)}
              className="btn-ghost px-3 py-1 text-xs"
              title="Send a test event through this channel"
            >
              Send test
            </button>
            <button
              onClick={() => remove(ch.id)}
              className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-xs text-rose-300 transition hover:bg-rose-400/20"
            >
              Remove
            </button>
          </div>

          <p className="text-[11px] text-slate-500">{HINTS[ch.type]}</p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ch.type === "webhook" && (
              <label className="flex flex-col gap-1 text-xs text-slate-400 sm:col-span-2">
                Endpoint URL
                <input
                  value={ch.url ?? ""}
                  onChange={(e) => update(ch.id, { url: e.target.value })}
                  placeholder="https://example.com/hook"
                  className="input-glass"
                />
              </label>
            )}
            {ch.type === "ntfy" && (
              <>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Server (blank = public ntfy.sh)
                  <input
                    value={ch.url ?? ""}
                    onChange={(e) => update(ch.id, { url: e.target.value })}
                    placeholder="https://ntfy.sh"
                    className="input-glass"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Topic
                  <input
                    value={ch.topic ?? ""}
                    onChange={(e) => update(ch.id, { topic: e.target.value })}
                    placeholder="my-project-updates"
                    className="input-glass"
                  />
                </label>
              </>
            )}
            {ch.type === "telegram" && (
              <>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Bot token
                  <input
                    value={ch.botToken ?? ""}
                    onChange={(e) => update(ch.id, { botToken: e.target.value })}
                    placeholder="123456:ABC-DEF…"
                    className="input-glass"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Chat id
                  <input
                    value={ch.chatId ?? ""}
                    onChange={(e) => update(ch.id, { chatId: e.target.value })}
                    placeholder="e.g. 123456789"
                    className="input-glass"
                  />
                </label>
              </>
            )}
            {ch.type === "email" && (
              <>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  SMTP host
                  <input
                    value={ch.smtpHost ?? ""}
                    onChange={(e) => update(ch.id, { smtpHost: e.target.value })}
                    placeholder="smtp.gmail.com"
                    className="input-glass"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Port (587 starttls · 465 ssl)
                  <input
                    value={String(ch.smtpPort ?? "")}
                    onChange={(e) =>
                      update(ch.id, { smtpPort: Number(e.target.value) || 587 })
                    }
                    placeholder="587"
                    className="input-glass"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Username
                  <input
                    value={ch.smtpUser ?? ""}
                    onChange={(e) => update(ch.id, { smtpUser: e.target.value })}
                    placeholder="you@gmail.com"
                    className="input-glass"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Password / app password
                  <input
                    type="password"
                    value={ch.smtpPass ?? ""}
                    onChange={(e) => update(ch.id, { smtpPass: e.target.value })}
                    placeholder="••••••••"
                    className="input-glass"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  From (optional)
                  <input
                    value={ch.mailFrom ?? ""}
                    onChange={(e) => update(ch.id, { mailFrom: e.target.value })}
                    placeholder="ProjectPulse &lt;pulse@local&gt;"
                    className="input-glass"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  To
                  <input
                    value={ch.mailTo ?? ""}
                    onChange={(e) => update(ch.id, { mailTo: e.target.value })}
                    placeholder="you@example.com"
                    className="input-glass"
                  />
                </label>
              </>
            )}
          </div>

          {/* delivery filters */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
            <label className="flex items-center gap-1.5">
              notify on
              <select
                value={ch.minPriority}
                onChange={(e) =>
                  update(ch.id, {
                    minPriority: e.target.value as NotifyChannel["minPriority"],
                  })
                }
                className="input-glass px-2 py-1 text-xs"
              >
                <option value="normal">all updates</option>
                <option value="high">high &amp; critical</option>
                <option value="critical">critical only</option>
              </select>
            </label>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              kinds
              {KINDS.map((k) => (
                <label key={k} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={(ch.kinds as readonly string[]).includes(k)}
                    onChange={() => toggleKind(ch, k)}
                  />
                  {k.replace("_", " ")}
                </label>
              ))}
              {ch.kinds.length === 0 && <span className="text-slate-600">(all)</span>}
            </span>
          </div>

          {testState[ch.id] && (
            <p
              className={`text-xs ${
                testState[ch.id].ok ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {testState[ch.id].ok ? "✓ " : "✗ "}
              {testState[ch.id].msg}
            </p>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary px-4 py-2 text-sm">
          {saving ? "Saving…" : "Save channels"}
        </button>
        {error && <span className="text-sm text-rose-400">{error}</span>}
      </div>

      {/* delivery log */}
      {log.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Recent deliveries
          </h3>
          <ul className="space-y-1">
            {log.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs"
              >
                <span
                  className={
                    l.status === "sent" ? "text-emerald-300" : "text-rose-300"
                  }
                >
                  {l.status === "sent" ? "✓" : "✗"}
                </span>
                <span className="font-medium text-slate-300">{l.channel}</span>
                <span className="text-slate-600">({l.channel_type})</span>
                {l.title && <span className="truncate text-slate-400">{l.title}</span>}
                {l.error && (
                  <span className="truncate text-rose-400/80" title={l.error}>
                    {l.error}
                  </span>
                )}
                <span className="ml-auto text-slate-600">
                  <Time iso={l.created_at} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}