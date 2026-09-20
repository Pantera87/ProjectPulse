import { NextResponse } from "next/server";
import { getDb, type SourceType, type WatchRule } from "@/lib/db";
import { indexForSearch } from "@/lib/models";
import { parseGithubRef } from "@/lib/github";
import { enrichSourceInitially } from "@/lib/check";
import { ensureCategoryIcon } from "@/lib/category-icons";

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
  subcategory?: string;
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
  const goal = (body.goal ?? "").trim() || null;
  const category = (body.category ?? "").trim() || null;
  const subcategory = (body.subcategory ?? "").trim() || null;
  const info = d
    .prepare(
      `INSERT INTO sources (type, url, name, goal, goal_source, category, subcategory, category_source, subcategory_source, notes, watch_enabled,
        check_interval_hours, rules_json, state_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`
    )
    .run(
      type,
      url,
      name,
      goal,
      goal ? "user" : null,
      category,
      category ? subcategory : null,
      category ? "user" : null,
      category ? "user" : null,
      (body.notes ?? "").trim() || null,
      body.watch_enabled ?? 1,
      body.check_interval_hours ?? 6,
      JSON.stringify(body.rules ?? []),
      new Date().toISOString()
    );
  const id = Number(info.lastInsertRowid);
  indexForSearch(d, "source", id, name ?? url, `${goal ?? ""} ${category ?? ""} ${subcategory ?? ""}`);
  // One serialized background pass populates everything (first check →
  // goal + initial updates → project summary → category/subcategory),
  // retrying briefly while fields are still missing (e.g. model loading).
  enrichSourceInitially(id);
  // Category saved by hand → ask the AI for a glyph in the background
  // (skipped when the category already has a stored AI icon — a previous
  // pick is never changed; the glyph appears on the next render once stored).
  if (category) {
    const context = [name ?? "", goal ?? ""].filter(Boolean).join(" — ");
    void ensureCategoryIcon(d, category, context || undefined).catch(() => {});
  }
  return NextResponse.json({ id }, { status: 201 });
}
