import { NextResponse } from "next/server";
import { ensureStartup } from "@/lib/startup";
import { schedulerStatus } from "@/lib/scheduler";
import { getAI, aiProviderLabel } from "@/lib/ai";

export const dynamic = "force-dynamic";

export function GET() {
  let dbOk = true;
  try {
    ensureStartup();
  } catch {
    dbOk = false;
  }
  const label = aiProviderLabel();
  return NextResponse.json({
    ok: dbOk,
    scheduler: schedulerStatus(),
    ai: {
      enabled: getAI().enabled,
      provider: label.provider,
      model: label.model,
    },
    webhook: Boolean(process.env.WEBHOOK_URL),
    auth: Boolean(process.env.AUTH_PASSWORD),
    time: new Date().toISOString(),
  });
}
