import { NextResponse } from "next/server";
import { readAIConfig } from "@/lib/ai";
import { defaultOllamaUrl } from "@/lib/ollama";

export const dynamic = "force-dynamic";

interface DetectResult {
  ok: boolean;
  url: string | null;
  version: string | null;
  tried: { url: string; version: string | null }[];
}

async function probe(url: string): Promise<string | null> {
  try {
    const r = await fetch(`${url}/api/version`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { version?: string } | null;
    return j?.version ?? "unknown";
  } catch {
    return null;
  }
}

/**
 * Probe the well-known Ollama endpoints (the configured URL first, then the
 * bundled compose service, host loopback and the Docker host) and return the
 * first that answers /api/version. Lets the Settings UI find the server
 * instead of the user having to figure out the address.
 */
async function detect(preferred: string): Promise<DetectResult> {
  const cfg = readAIConfig();
  const candidates = [
    preferred,
    cfg.ollamaUrl,
    defaultOllamaUrl(),
    "http://ollama:11434", // bundled ollama service (docker-compose.yml)
    "http://127.0.0.1:11434", // Ollama on the machine running the app
    "http://host.docker.internal:11434", // Ollama on the Docker host (macOS/Windows)
    "http://localhost:11434",
  ];
  const seen = new Set<string>();
  const tried: { url: string; version: string | null }[] = [];
  for (const c of candidates) {
    const url = (c ?? "").trim().replace(/\/+$/, "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const version = await probe(url);
    tried.push({ url, version });
    if (version !== null) return { ok: true, url, version, tried };
  }
  return { ok: false, url: null, version: null, tried };
}

/** POST /api/ai/ollama/detect — body: { url? } (address to try first). */
export async function POST(req: Request) {
  let preferred = "";
  try {
    const body = (await req.json()) as { url?: string };
    preferred = String(body.url ?? "");
  } catch {
    // no JSON body — probe the built-in candidates
  }
  return NextResponse.json(await detect(preferred));
}

/** GET /api/ai/ollama/detect — probe the built-in candidates. */
export async function GET() {
  return NextResponse.json(await detect(""));
}