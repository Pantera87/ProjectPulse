import { NextResponse } from "next/server";
import { readOllamaLogs } from "@/lib/ollama";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/ollama/logs?lines=400 — tail of the bundled Ollama server's
 * log. docker-compose.yml tees `ollama serve` into /logs/ollama.log on a
 * volume shared with the app; the Settings → AI terminal panel polls this
 * endpoint every few seconds.
 */
export async function GET(req: Request) {
  const param = new URL(req.url).searchParams.get("lines") ?? "400";
  const n = parseInt(param, 10);
  const lines = Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 400;
  const j = readOllamaLogs(lines);
  return NextResponse.json({ ok: true, ...j });
}