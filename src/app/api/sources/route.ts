import { NextResponse } from "next/server";
import { getDb, type SourceType, type WatchRule } from "@/lib/db";
import { indexForSearch } from "@/lib/models";
import { parseGithubRef } from "@/lib/github";
import { ensureProjectSummaryById } from "@/lib/project-summary";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const d = getDb();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as SourceType | null;
  const rows = type
    ? d.prepare("SELECT * FROM sources WHERE type = ? ORDER BY id DESC").all(type)
    : d.prepare("SELECT * FROM sources ORDER BY id DESC").all();
  const unread = d
    .prepare(
      `SELECT source_id, COUNT(*) AS c FROM updates WHERE read_at IS NULL GROUP BY source_id`
    )
    .all() as { source_id: number; c: number }[];
  const map = new Map(unread.map((r) => [r.source_id, r.c]));
  return NextResponse.json(
    (rows as Record<string, unknown>[]).map((r) => ({
      ...r,
      unread: map.get(Number(r.id)) ?? 0,
    }))
  );
}

interface CreateBody {
  type?: SourceType;
  url?: string;
  name?: string;
  notes?: string;
  goal?: string;
  category?: string;
  watch_enabled?: number;
  check_interval_hours?: number;
  rules?: WatchRule[];
}

export async function POST(req: Request) {
  const d = getDb();
  const body = (await req.json()) as CreateBody;
  const type = body.type;
  const url = (body.url ?? "").trim();

  if (!type || !["website", "github", "rss"].includes(type))
    return NextResponse.json({ error: "type must be website|github|rss" }, { status: 400 });
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  if (type === "github") {
    if (!parseGithubRef(url))
      return NextResponse.json(
        { error: "GitHub reference must be owner/repo or a github.com URL" },
        { status: 400 }
      );
  } else {
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
  }

  const name = (body.name ?? "").trim() || null;
  const info = d
    .prepare(
      `INSERT INTO sources (type, url, name, goal, category, notes, watch_enabled,
        check_interval_hours, rules_json, state_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`
    )
    .run(
      type,
      url,
      name,
      (body.goal ?? "").trim() || null,
      (body.category ?? "").trim() || null,
      (body.notes ?? "").trim() || null,
      body.watch_enabled ?? 1,
      body.check_interval_hours ?? 6,
      JSON.stringify(body.rules ?? []),
      new Date().toISOString()
    );
  const id = Number(info.lastInsertRowid);
  indexForSearch(d, "source", id, name ?? url, body.goal ?? "");
  // AI project summary (background — also auto-downloads the Ollama model
  // if AI is enabled but the model is not on the machine yet).
  ensureProjectSummaryById(id);
  return NextResponse.json({ id }, { status: 201 });
}
