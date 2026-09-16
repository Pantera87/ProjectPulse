import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST /api/updates/:id — { read?: boolean } toggle one update; DELETE removes it. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = getDb();
  const body = (await req.json().catch(() => ({}))) as { read?: boolean };
  const now = body.read === false ? null : new Date().toISOString();
  const info = d.prepare("UPDATE updates SET read_at = ? WHERE id = ?").run(now, Number(id));
  if (info.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = getDb();
  const info = d.prepare("DELETE FROM updates WHERE id = ?").run(Number(id));
  if (info.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
