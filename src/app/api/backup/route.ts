import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { indexForSearch } from "@/lib/models";
import { encodeHtmlCell, decodeHtmlCell } from "@/lib/text";

export const dynamic = "force-dynamic";

/** GET /api/backup — download full backup as JSON. */
export function GET() {
  const d = getDb();
  // Stored HTML columns are zlib-compressed in the DB (or legacy plain
  // text) — encode them so the backup JSON stays text-safe.
  const snapshots = (d.prepare("SELECT * FROM snapshots").all() as Record<
    string,
    unknown
  >[]).map((s) => ({
    ...s,
    html: encodeHtmlCell(s.html),
    html_local: encodeHtmlCell(s.html_local),
  }));
  const payload = {
    app: "projectpulse",
    version: 1,
    exported_at: new Date().toISOString(),
    sources: d.prepare("SELECT * FROM sources").all(),
    snapshots,
    updates: d.prepare("SELECT * FROM updates").all(),
    settings: d.prepare("SELECT * FROM settings").all(),
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="projectpulse-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}

/** POST /api/backup — restore from uploaded backup JSON (replaces current data). */
type Row = Record<string, unknown>;

interface BackupBody {
  app?: string;
  version?: number;
  exported_at?: string;
  sources?: Row[];
  snapshots?: Row[];
  updates?: Row[];
  settings?: Row[];
}

/** Validate the uploaded backup shape before touching the database. */
function validate(body: BackupBody): string | null {
  const tables = ["sources", "snapshots", "updates", "settings"] as const;
  for (const t of tables) {
    const rows = body[t];
    if (rows !== undefined && !Array.isArray(rows))
      return `Field "${t}" must be an array`;
  }
  for (const s of body.sources ?? []) {
    if (typeof s.id !== "number" || typeof s.url !== "string" || !s.url)
      return `sources: every row needs a numeric id and a non-empty url (got ${JSON.stringify(s).slice(0, 120)})`;
    if (typeof s.type !== "string" || !s.type)
      return `sources: row ${String(s.id)} is missing type`;
  }
  for (const s of body.snapshots ?? []) {
    if (typeof s.id !== "number" || typeof s.source_id !== "number")
      return `snapshots: every row needs numeric id and source_id`;
  }
  for (const u of body.updates ?? []) {
    if (typeof u.id !== "number" || typeof u.source_id !== "number")
      return `updates: every row needs numeric id and source_id`;
  }
  for (const st of body.settings ?? []) {
    if (typeof st.key !== "string" || !st.key)
      return `settings: every row needs a non-empty key`;
  }
  return null;
}

export async function POST(req: Request) {
  const d = getDb();
  let body: BackupBody;
  try {
    body = (await req.json()) as BackupBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.app !== "projectpulse")
    return NextResponse.json({ error: "Not a ProjectPulse backup" }, { status: 400 });
  const invalid = validate(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  try {
    const tx = d.transaction(() => {
    d.prepare("DELETE FROM updates").run();
    d.prepare("DELETE FROM snapshots").run();
    d.prepare("DELETE FROM sources").run();
    d.prepare("DELETE FROM search_index").run();
    d.prepare("DELETE FROM sqlite_sequence WHERE name IN ('sources','snapshots','updates')").run();

    const insSource = d.prepare(
      `INSERT INTO sources (id, type, url, name, goal, goal_source, category, subcategory, category_source, notes, watch_enabled,
        check_interval_hours, last_checked_at, last_content_hash, last_error,
        muted_until, rules_json, state_json, created_at, logo, project_summary, summary_size,
        track_releases, track_readme, track_commits)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of body.sources ?? [])
      insSource.run(
        s.id, s.type, s.url, s.name ?? null, s.goal ?? null, s.goal_source ?? null,
        s.category ?? null,
        s.subcategory ?? null, s.category_source ?? null,
        s.notes ?? null, s.watch_enabled ?? 1, s.check_interval_hours ?? 6,
        s.last_checked_at ?? null, s.last_content_hash ?? null, s.last_error ?? null,
        s.muted_until ?? null, s.rules_json ?? "[]", s.state_json ?? "{}",
        s.created_at ?? new Date().toISOString(), s.logo ?? null, s.project_summary ?? null,
        s.summary_size ?? null, s.track_releases ?? 1, s.track_readme ?? 0, s.track_commits ?? 0
      );
    const insSnap = d.prepare(
      `INSERT INTO snapshots (id, source_id, version, fetched_at, html, content_hash, title, screenshot, html_local)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of body.snapshots ?? [])
      insSnap.run(
        s.id, s.source_id, s.version, s.fetched_at,
        decodeHtmlCell(s.html), s.content_hash,
        s.title ?? null, s.screenshot ?? null,
        decodeHtmlCell(s.html_local)
      );
    const insUpd = d.prepare(
      `INSERT INTO updates (id, source_id, priority, kind, title, summary, url, payload_json, created_at, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const u of body.updates ?? [])
      insUpd.run(
        u.id, u.source_id, u.priority, u.kind, u.title, u.summary ?? null,
        u.url ?? null, u.payload_json ?? "{}", u.created_at, u.read_at ?? null
      );
    d.prepare("DELETE FROM settings").run();
    const insSet = d.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    for (const st of body.settings ?? []) insSet.run(st.key, st.value);

    // Rebuild the FTS index (same title/body format as source creation in
    // api/sources/route.ts — otherwise search stays empty after restore).
    for (const s of body.sources ?? [])
      indexForSearch(
        d,
        "source",
        s.id as number,
        (s.name as string) ?? (s.url as string),
        `${s.goal ?? ""} ${s.category ?? ""} ${s.subcategory ?? ""}`
      );
    });
    tx();
  } catch (e) {
    console.error("[backup] restore failed:", e);
    return NextResponse.json(
      { error: `Restore failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    counts: {
      sources: (body.sources ?? []).length,
      snapshots: (body.snapshots ?? []).length,
      updates: (body.updates ?? []).length,
      settings: (body.settings ?? []).length,
    },
  });
}
