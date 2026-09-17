import { NextResponse } from "next/server";
import { testChannel, type NotifyChannel } from "@/lib/notifiers";

export const dynamic = "force-dynamic";

/** POST /api/notify/test — { channel } sends one test event through that channel. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { channel?: NotifyChannel };
  const ch = body.channel;
  if (!ch?.type)
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  const result = await testChannel(ch);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}