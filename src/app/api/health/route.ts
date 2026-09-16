import { NextResponse } from "next/server";
import { ensureStartup } from "@/lib/startup";
import { schedulerStatus } from "@/lib/scheduler";
import { getAI } from "@/lib/ai";

export const dynamic = "force-dynamic";

export function GET() {
  let dbOk = true;
  try {
    ensureStartup();
  } catch {
    dbOk = false;
  }
  return NextResponse.json({
    ok: dbOk,
    scheduler: schedulerStatus(),
    ai: {
      enabled: getAI().enabled,
      model: process.env.OLLAMA_MODEL ?? null,
    },
    webhook: Boolean(process.env.WEBHOOK_URL),
    auth: Boolean(process.env.AUTH_PASSWORD),
    time: new Date().toISOString(),
  });
}
