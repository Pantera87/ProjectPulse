import { NextResponse } from "next/server";
import { readAIConfig } from "@/lib/ai";
import { startPull, getPullJobs, defaultOllamaUrl } from "@/lib/ollama";

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
  // Endpoint: the saved URL, or the resolved default (bundled compose
  // service inside Docker, host loopback elsewhere).
  const root = (cfg.ollamaUrl || defaultOllamaUrl()).replace(/\/+$/, "");

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
        error: `Ollama is not reachable at ${root}. If the app runs in Docker, make sure the bundled ollama service (docker-compose.yml) is up; otherwise install Ollama on the machine that address points to (https://ollama.com/download) or let Settings → AI detect the address. Models are fetched by Ollama itself from the official registry (registry.ollama.ai).`,
      },
      { status: 503 },
    );

  startPull(root, name);
  const job = getPullJobs()[name];
  return NextResponse.json({ ok: true, name, status: job.status, progress: job.progress });
}