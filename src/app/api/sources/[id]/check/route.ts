import { NextResponse } from "next/server";
import { checkSourceById } from "@/lib/check";

export const dynamic = "force-dynamic";

/** POST /api/sources/:id/check — run the checker for this source now. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await checkSourceById(Number(id));
  return NextResponse.json(result);
}
