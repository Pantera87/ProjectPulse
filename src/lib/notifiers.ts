import nodemailer from "nodemailer";
import type Database from "better-sqlite3";
import { getDb, getSetting, setSetting } from "./db";
import type { Priority, UpdateKind } from "./db";

/**
 * Notification engine.
 *
 * Channels (webhook / ntfy / telegram / email) are configured in the UI and
 * stored as JSON in the `settings` table (key `notify_channels`). Every new
 * update fans out to all enabled channels whose filters match the event:
 *
 *  - `minPriority`: deliver this priority and up (critical < high < normal);
 *  - `kinds`: optional whitelist of update kinds (empty = all).
 *
 * Delivery is best-effort and fire-and-forget from the checkers: each
 * channel gets one retry with a 2 s backoff, and every event+channel
 * combination is recorded in `notification_log` (status / error / attempts)
 * so failures are visible in Settings instead of vanishing into logs.
 *
 * Backward compatibility: if the `WEBHOOK_URL` env var is set and the user
 * has saved no webhook channel, it acts as an implicit always-on channel.
 */

export type ChannelType = "webhook" | "ntfy" | "telegram" | "email";

export interface UpdateEvent {
  id: number;
  title: string;
  summary: string | null;
  url: string | null;
  priority: Priority;
  kind: UpdateKind;
  sourceName: string;
  sourceUrl: string | null;
}

export interface NotifyChannel {
  id: string;
  type: ChannelType;
  name: string;
  enabled: boolean;
  /** webhook: endpoint URL · ntfy: server base URL (e.g. https://ntfy.sh) */
  url?: string;
  /** ntfy topic (created automatically on first post) */
  topic?: string;
  /** telegram: bot token from @BotFather */
  botToken?: string;
  /** telegram: target chat id */
  chatId?: string;
  /** email: SMTP + addresses */
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  mailFrom?: string;
  mailTo?: string;
  /** minimum priority to deliver: "critical" | "high" | "normal" */
  minPriority: Priority;
  /** only these update kinds; empty = all */
  kinds: UpdateKind[];
}

export interface NotifyLogRow {
  id: number;
  channel: string;
  channel_type: string;
  update_id: number | null;
  priority: string | null;
  status: string;
  error: string | null;
  attempts: number;
  created_at: string;
  title: string | null;
}

const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, normal: 2 };
const SETTINGS_KEY = "notify_channels";

/* ---------------- storage ---------------- */

export function readChannels(d: Database.Database): NotifyChannel[] {
  const raw = getSetting(d, SETTINGS_KEY);
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as NotifyChannel[]) : [];
  } catch {
    return [];
  }
}

export function saveChannels(d: Database.Database, channels: NotifyChannel[]): void {
  setSetting(d, SETTINGS_KEY, JSON.stringify(channels));
}

function logAttempt(
  d: Database.Database,
  ch: Pick<NotifyChannel, "name" | "type">,
  updateId: number | null,
  priority: Priority | null,
  status: "sent" | "failed",
  error: string | null,
  attempts: number
): void {
  try {
    d
      .prepare(
        `INSERT INTO notification_log
           (channel, channel_type, update_id, priority, status, error, attempts, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(ch.name, ch.type, updateId, priority, status, error, attempts, new Date().toISOString());
  } catch (e) {
    console.warn("[notify] failed to write log:", e);
  }
}

export function recentLog(d: Database.Database, limit = 20): NotifyLogRow[] {
  return d
    .prepare(
      `SELECT l.*, u.title FROM notification_log l
       LEFT JOIN updates u ON u.id = l.update_id
       ORDER BY l.id DESC LIMIT ?`
    )
    .all(limit) as NotifyLogRow[];
}

/** All channels that should receive the event (env webhook included). */
export function activeChannels(d: Database.Database, ev: UpdateEvent): NotifyChannel[] {
  let channels = readChannels(d);
  const envUrl = process.env.WEBHOOK_URL;
  if (envUrl && !channels.some((c) => c.type === "webhook")) {
    channels = [
      ...channels,
      {
        id: "env-webhook",
        type: "webhook",
        name: "webhook (WEBHOOK_URL env)",
        enabled: true,
        url: envUrl,
        minPriority: "normal",
        kinds: [],
      },
    ];
  }
  return channels.filter((c) => {
    if (!c.enabled) return false;
    if (PRIORITY_ORDER[ev.priority] > PRIORITY_ORDER[c.minPriority ?? "normal"]) return false;
    if (c.kinds?.length && !c.kinds.includes(ev.kind)) return false;
    return true;
  });
}

/* ---------------- channel senders ---------------- */

const NTFS_PRIORITY: Record<Priority, number> = { critical: 4, high: 3, normal: 2 };
const NTFS_TAG: Record<Priority, string> = {
  critical: "critical",
  high: "warning",
  normal: "info",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Send one event to one channel; throws on failure (caller retries/logs). */
export async function sendChannel(ch: NotifyChannel, ev: UpdateEvent): Promise<void> {
  switch (ch.type) {
    case "webhook": {
      if (!ch.url) throw new Error("webhook channel has no URL");
      await fetch(ch.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...ev,
          app: "projectpulse",
          sent_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return;
    }
    case "ntfy": {
      const base = (ch.url || "https://ntfy.sh").replace(/\/+$/, "");
      if (!ch.topic) throw new Error("ntfy channel has no topic");
      const r = await fetch(`${base}/${encodeURIComponent(ch.topic)}`, {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          Title: `[${ev.priority}] ${ev.title}`,
          Priority: String(NTFS_PRIORITY[ev.priority]),
          Tags: NTFS_TAG[ev.priority],
          ...(ev.url ? { Click: ev.url } : {}),
        },
        body: ev.summary || `${ev.kind} · ${ev.sourceName}`,
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`ntfy server replied ${r.status}`);
      return;
    }
    case "telegram": {
      if (!ch.botToken || !ch.chatId)
        throw new Error("telegram channel needs a bot token and a chat id");
      const text = [
        `📣 ProjectPulse — ${ev.priority.toUpperCase()}`,
        ev.title,
        ev.summary ?? "",
        ev.url ?? "",
      ]
        .filter(Boolean)
        .join("\n");
      const r = await fetch(`https://api.telegram.org/bot${ch.botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: ch.chatId, text }),
        signal: AbortSignal.timeout(15_000),
      });
      const j = (await r.json().catch(() => null)) as
        | { ok?: boolean; description?: string }
        | null;
      if (!r.ok || !j?.ok) throw new Error(j?.description ?? `Telegram replied ${r.status}`);
      return;
    }

    case "email": {
      if (!ch.smtpHost || !ch.mailTo)
        throw new Error("email channel needs an SMTP host and a recipient");
      const port = ch.smtpPort ?? 587;
      const transporter = nodemailer.createTransport({
        host: ch.smtpHost,
        port,
        secure: port === 465,
        ...(ch.smtpUser ? { auth: { user: ch.smtpUser, pass: ch.smtpPass ?? "" } } : {}),
      });
      const subject = `[ProjectPulse] ${ev.priority.toUpperCase()} — ${ev.title}`;
      const html = [
        `<p><strong>${escapeHtml(ev.title)}</strong></p>`,
        ev.summary ? `<p>${escapeHtml(ev.summary).replace(/\n/g, "<br>")}</p>` : "",
        ev.url ? `<p><a href="${escapeHtml(ev.url)}">${escapeHtml(ev.url)}</a></p>` : "",
        `<p style="color:#888;font-size:12px">${escapeHtml(ev.kind)} · ${escapeHtml(
          ev.sourceName
        )} · ${ev.priority}</p>`,
      ].join("");
      await transporter.sendMail({
        from: ch.mailFrom || ch.smtpUser || "ProjectPulse <pulse@localhost>",
        to: ch.mailTo,
        subject,
        text: [ev.title, ev.summary ?? "", ev.url ?? ""].filter(Boolean).join("\n"),
        html,
      });
      return;
    }
    default:
      throw new Error(`unknown channel type: ${(ch as { type?: string }).type}`);
  }
}

/* ---------------- entry points ---------------- */

/**
 * Fire-and-forget fan-out used by the checkers: never blocks the checker
 * beyond best effort, never throws, logs every delivery to notification_log.
 */
export async function notify(event: UpdateEvent): Promise<void> {
  try {
    const d = getDb();
    const targets = activeChannels(d, event);
    await Promise.all(
      targets.map(async (ch) => {
        try {
          await sendChannel(ch, event);
          logAttempt(d, ch, event.id, event.priority, "sent", null, 1);
        } catch {
          await new Promise((r) => setTimeout(r, 2000)); // one retry, short backoff
          try {
            await sendChannel(ch, event);
            logAttempt(d, ch, event.id, event.priority, "sent", null, 2);
          } catch (e2) {
            logAttempt(d, ch, event.id, event.priority, "failed", String(e2), 2);
            console.warn(`[notify] ${ch.name} failed:`, e2);
          }
        }
      })
    );
  } catch (e) {
    console.warn("[notify] error:", e);
  }
}

/** Synchronous send of a test event (Settings "Send test" button). */
export async function testChannel(ch: NotifyChannel): Promise<{ ok: boolean; error?: string }> {
  const event: UpdateEvent = {
    id: 0,
    title: "Test notification from ProjectPulse",
    summary: "If you can read this, your channel is configured correctly.",
    url: null,
    priority: "normal",
    kind: "content_change",
    sourceName: "ProjectPulse",
    sourceUrl: null,
  };
  try {
    await sendChannel(ch, event);
    const d = getDb();
    logAttempt(d, ch, null, "normal", "sent", null, 1);
    return { ok: true };
  } catch (e) {
    try {
      const d = getDb();
      logAttempt(d, ch, null, "normal", "failed", String(e), 1);
    } catch {
      // log failure is best-effort
    }
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}