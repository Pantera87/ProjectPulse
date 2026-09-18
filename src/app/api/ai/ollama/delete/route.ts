import { NextResponse } from "next/server";
import { readAIConfig } from "@/lib/ai";
import { ollamaDeleteModel, defaultOllamaUrl } from "@/lib/ollama";

export const dynamic = "force-dynamic";

interface Body {
  name?: string;
}

/**
 * POST /api/ai/ollama/delete — delete an installed Ollama model from disk.
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

  // Quick reachability check so the UI gets immediate, actionable feedback.
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
        error: `Ollama is not reachable at ${root}. Make sure it is running, then try again.`,
      },
      { status: 503 },
    );

  const result = await ollamaDeleteModel(root, name);
  return result.ok
    ? NextResponse.json({ ok: true, name })
    : NextResponse.json({ error: result.error ?? "Delete failed" }, { status: 502 });
}
