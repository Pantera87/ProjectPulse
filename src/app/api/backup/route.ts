import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/backup — download full backup as JSON. */
export function GET() {
  const d = getDb();
  const payload = {
    app: "projectpulse",
    version: 1,
    exported_at: new Date().toISOString(),
    sources: d.prepare("SELECT * FROM sources").all(),
    snapshots: d.prepare("SELECT * FROM snapshots").all(),
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
export async function POST(req: Request) {
  const d = getDb();
  let body: {
    app?: string;
    sources?: Record<string, unknown>[];
    snapshots?: Record<string, unknown>[];
    updates?: Record<string, unknown>[];
    settings?: Record<string, unknown>[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.app !== "projectpulse")
    return NextResponse.json({ error: "Not a ProjectPulse backup" }, { status: 400 });

  const tx = d.transaction(() => {
    d.prepare("DELETE FROM updates").run();
    d.prepare("DELETE FROM snapshots").run();
    d.prepare("DELETE FROM sources").run();
    d.prepare("DELETE FROM search_index").run();
    d.prepare("DELETE FROM sqlite_sequence WHERE name IN ('sources','snapshots','updates')").run();

    const insSource = d.prepare(
      `INSERT INTO sources (id, type, url, name, goal, category, notes, watch_enabled,
        check_interval_hours, last_checked_at, last_content_hash, last_error,
        muted_until, rules_json, state_json, created_at, logo, project_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of body.sources ?? [])
      insSource.run(
        s.id, s.type, s.url, s.name ?? null, s.goal ?? null, s.category ?? null,
        s.notes ?? null, s.watch_enabled ?? 1, s.check_interval_hours ?? 6,
        s.last_checked_at ?? null, s.last_content_hash ?? null, s.last_error ?? null,
        s.muted_until ?? null, s.rules_json ?? "[]", s.state_json ?? "{}",
        s.created_at ?? new Date().toISOString(), s.logo ?? null, s.project_summary ?? null
      );
    const insSnap = d.prepare(
      `INSERT INTO snapshots (id, source_id, version, fetched_at, html, content_hash, title)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of body.snapshots ?? [])
      insSnap.run(s.id, s.source_id, s.version, s.fetched_at, s.html, s.content_hash, s.title ?? null);
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
  });
  tx();
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
