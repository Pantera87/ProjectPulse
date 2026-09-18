import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Priority, UpdateKind } from "@/lib/db";
import {
  readChannels,
  saveChannels,
  recentLog,
  type ChannelType,
  type NotifyChannel,
} from "@/lib/notifiers";

export const dynamic = "force-dynamic";

const TYPES: ChannelType[] = ["webhook", "ntfy", "telegram", "email"];
const PRIORITIES: Priority[] = ["critical", "high", "normal"];
const KINDS = [
  "content_change",
  "release",
  "readme",
  "commit",
  "milestone",
  "issue",
  "feed_entry",
  "keyword",
];

function validateChannel(c: Record<string, unknown>, i: number): NotifyChannel | null {
  const type = c.type as ChannelType;
  if (!TYPES.includes(type)) return null;
  const ch: NotifyChannel = {
    id: String(c.id || `ch-${Date.now()}-${i}`),
    type,
    name: String(c.name || type),
    enabled: c.enabled !== false,
    minPriority: (PRIORITIES.includes(c.minPriority as Priority) ? c.minPriority : "normal") as Priority,
    kinds: Array.isArray(c.kinds) ? (c.kinds.filter((k) => KINDS.includes(k as UpdateKind)) as UpdateKind[]) : [],
  };
  if (type === "webhook") {
    ch.url = String(c.url || "").trim();
    if (!ch.url) return null;
  } else if (type === "ntfy") {
    ch.url = String(c.url || "").trim();
    ch.topic = String(c.topic || "").trim();
    if (!ch.topic) return null;
  } else if (type === "telegram") {
    ch.botToken = String(c.botToken || "").trim();
    ch.chatId = String(c.chatId || "").trim();
    if (!ch.botToken || !ch.chatId) return null;
  } else {
    // email
    ch.smtpHost = String(c.smtpHost || "").trim();
    ch.smtpPort = Number(c.smtpPort) || 587;
    ch.smtpUser = String(c.smtpUser || "").trim();
    ch.smtpPass = String(c.smtpPass || "").trim();
    ch.mailFrom = String(c.mailFrom || "").trim();
    ch.mailTo = String(c.mailTo || "").trim();
    if (!ch.smtpHost || !ch.mailTo) return null;
  }
  return ch;
}

/** GET /api/notify/channels — current channels + recent delivery log. */
export function GET() {
  const d = getDb();
  return NextResponse.json({ channels: readChannels(d), log: recentLog(d, 20) });
}

/** POST /api/notify/channels — { channels: [...] } replaces the stored list. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { channels?: unknown };
  if (!Array.isArray(body.channels))
    return NextResponse.json({ error: "channels array is required" }, { status: 400 });
  const channels: NotifyChannel[] = [];
  for (let i = 0; i < body.channels.length; i++) {
    const c = body.channels[i] as Record<string, unknown>;
    const ch = validateChannel(c, i);
    if (!ch)
      return NextResponse.json(
        { error: `channel ${i + 1} is missing required fields for its type` },
        { status: 400 }
      );
    channels.push(ch);
  }
  const d = getDb();
  saveChannels(d, channels);
  return NextResponse.json({ ok: true, channels, log: recentLog(d, 20) });
}