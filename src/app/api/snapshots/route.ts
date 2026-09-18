import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deleteAllSnapshots } from "@/lib/models";

export const dynamic = "force-dynamic";

/** DELETE /api/snapshots → delete ALL snapshots of all sources. */
export function DELETE() {
  const removed = deleteAllSnapshots(getDb());
  return NextResponse.json({ ok: true, removed });
}