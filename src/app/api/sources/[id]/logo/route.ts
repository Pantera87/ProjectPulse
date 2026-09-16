import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getDb, dataDir } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/sources/:id/logo → project logo (GitHub repo avatar) PNG, if stored. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = getDb();
  const row = d
    .prepare("SELECT logo FROM sources WHERE id = ?")
    .get(Number(id)) as { logo: string | null } | undefined;
  if (!row || !row.logo)
    return NextResponse.json({ error: "No logo yet — run “Check now”" }, { status: 404 });

  const base = dataDir();
  const abs = path.join(/*turbopackIgnore: true*/ base, row.logo);
  if (!abs.startsWith(base + path.sep) || !fs.existsSync(abs))
    return NextResponse.json({ error: "Logo file missing" }, { status: 404 });

  const buf = fs.readFileSync(abs);
  return new NextResponse(buf, {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}