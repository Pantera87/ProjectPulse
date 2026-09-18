import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getDb, dataDir } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/sources/:id/screenshot?version=N → PNG of website snapshot N
 * GET /api/sources/:id/screenshot            → PNG of the latest snapshot
 * GET /api/sources/:id/screenshot?repo=1     → PNG of the GitHub repo page
 * DELETE /api/sources/:id/screenshot?repo=1  → delete the GitHub repo page PNG
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = getDb();
  const sourceId = Number(id);
  if (!d.prepare("SELECT id FROM sources WHERE id = ?").get(sourceId))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  let rel: string | null = null;
  if (url.searchParams.get("repo")) {
    rel = `screenshots/github-${sourceId}.png`;
  } else {
    const version = url.searchParams.get("version");
    const row = version
      ? d
          .prepare("SELECT screenshot FROM snapshots WHERE source_id = ? AND version = ?")
          .get(sourceId, Number(version))
      : d
          .prepare("SELECT screenshot FROM snapshots WHERE source_id = ? ORDER BY version DESC LIMIT 1")
          .get(sourceId);
    rel = ((row as { screenshot: string | null } | undefined)?.screenshot ?? null);
  }

  if (!rel)
    return NextResponse.json(
      { error: "No screenshot yet — run “Check now” to capture one" },
      { status: 404 }
    );

  const base = dataDir();
  const abs = path.join(/*turbopackIgnore: true*/ base, rel);
  if (!abs.startsWith(base + path.sep) || !fs.existsSync(abs))
    return NextResponse.json({ error: "Screenshot file missing" }, { status: 404 });

  const buf = fs.readFileSync(abs);
  return new NextResponse(buf, {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = getDb();
  const sourceId = Number(id);
  if (!d.prepare("SELECT id FROM sources WHERE id = ?").get(sourceId))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Website snapshot screenshots are removed with the snapshots (DELETE
  // /api/sources/:id/snapshots) — here only the repo page screenshot.
  const url = new URL(req.url);
  if (!url.searchParams.get("repo"))
    return NextResponse.json(
      { error: "Only the repo screenshot can be deleted here" },
      { status: 400 }
    );

  const base = dataDir();
  const abs = path.join(
    /*turbopackIgnore: true*/ base,
    `screenshots/github-${sourceId}.png`
  );
  if (!abs.startsWith(base + path.sep) || !fs.existsSync(abs))
    return NextResponse.json({ error: "Screenshot file missing" }, { status: 404 });

  fs.rmSync(abs);
  return NextResponse.json({ ok: true });
}