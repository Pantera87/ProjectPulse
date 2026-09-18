import { NextResponse } from "next/server";
import { getDb, type SourceRow, type SourceType } from "@/lib/db";
import { checkSource } from "@/lib/check";

export const dynamic = "force-dynamic";

// Manual "check all" run state, kept on globalThis so Next.js hot reloads and
// route module instances share one in-flight run (same pattern as scheduler).
// `type` is the source type this run is scoped to (null = every type).
const g = globalThis as unknown as {
  __ppCheckAll?: {
    running: boolean;
    checked: number;
    failed: number;
    total: number;
    type: SourceType | null;
  };
};

function state() {
  return (g.__ppCheckAll ??= {
    running: false,
    checked: 0,
    failed: 0,
    total: 0,
    type: null,
  });
}

const TYPES: SourceType[] = ["website", "github", "rss"];

/**
 * POST /api/sources/check-all — run the checker now (ignores per-source
 * interval/mute/watch state, like a manual "Check now"). By default checks
 * EVERY source; pass { type } to scope the run to one source type. Runs in the
 * background because website checks include fetch + screenshot and a full pass
 * can take minutes; returns immediately with the source count.
 */
export async function POST(req: Request) {
  const s = state();
  if (s.running) return NextResponse.json({ running: true, type: s.type });

  const body = (await req.json().catch(() => ({}))) as { type?: unknown };
  const type = TYPES.includes(body.type as SourceType) ? (body.type as SourceType) : null;

  const d = getDb();
  const rows = (
    type
      ? d.prepare("SELECT * FROM sources WHERE type = ?").all(type)
      : d.prepare("SELECT * FROM sources").all()
  ) as SourceRow[];
  s.running = true;
  s.checked = 0;
  s.failed = 0;
  s.total = rows.length;
  s.type = type;

  void (async () => {
    for (const row of rows) {
      try {
        const result = await checkSource(d, row);
        if (!result.ok) {
          s.failed += 1;
          console.warn(`[check-all] source ${row.id} (${row.type}) failed: ${result.error}`);
        }
      } catch (e) {
        s.failed += 1;
        console.warn(`[check-all] source ${row.id} (${row.type}) crashed:`, e);
      }
      s.checked += 1;
    }
    s.running = false;
  })();

  return NextResponse.json({ started: true, count: rows.length, type });
}

/** GET /api/sources/check-all — progress of the in-flight run (for the UI). */
export function GET() {
  const s = state();
  return NextResponse.json({
    running: s.running,
    checked: s.checked,
    failed: s.failed,
    total: s.total,
    type: s.type,
  });
}

