import { NextResponse } from "next/server";
import { readAIConfig } from "@/lib/ai";
import { startPull, getPullJobs } from "@/lib/ollama";

export const dynamic = "force-dynamic";

interface Body {
  name?: string;
}

/**
 * POST /api/ai/ollama/pull — start (or join) a background download of an
 * Ollama model. Progress is reported via GET /api/ai (ollama.pulls).
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!/^[a-z0-9._\/:-]+:[a-z0-9._\/:-]+$/i.test(name) && !/^[a-z0-9._\/-]+$/i.test(name))
    return NextResponse.json({ error: "Invalid model name" }, { status: 400 });

  const cfg = readAIConfig();
  // Ollama's default local endpoint when the user hasn't set one.
  const root = (cfg.ollamaUrl || "http://localhost:11434").replace(/\/+$/, "");

  // Quick reachability check so the UI gets immediate, actionable feedback
  // instead of a job that errors a moment later.
  let up = false;
  try {
    const r = await fetch(`${root}/api/version`, { signal: AbortSignal.timeout(3000) });
    up = r.ok;
  } catch {
    up = false;
  }
  if (!up)
    return NextResponse.json(
      {
        error: `Ollama is not reachable at ${root}. Install it from https://ollama.com/download (Windows: "winget install Ollama.Ollama"), make sure it is running (system tray or "ollama serve"), then press Download again. Models are fetched by Ollama itself from the official registry (registry.ollama.ai).`,
      },
      { status: 503 },
    );

  startPull(root, name);
  const job = getPullJobs()[name];
  return NextResponse.json({ ok: true, name, status: job.status, progress: job.progress });
}