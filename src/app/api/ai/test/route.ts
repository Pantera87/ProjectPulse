import { NextResponse } from "next/server";
import { testAI } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** POST /api/ai/test — run a trivial generation through the active provider. */
export async function POST() {
  const r = await testAI();
  return NextResponse.json(r);
}