import { NextResponse } from "next/server";
import { aiState, saveAIConfig, type AIConfig } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** GET /api/ai — full AI state (enabled?, provider, model, Ollama status). */
export async function GET() {
  return NextResponse.json(await aiState());
}

interface SaveBody extends Partial<AIConfig> {
  enabled?: "on" | "off" | null;
}

/** POST /api/ai — save AI configuration (any subset of fields). */
export async function POST(req: Request) {
  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const keep: (keyof AIConfig)[] = [
    "provider",
    "model",
    "ollamaUrl",
    "openaiUrl",
    "openaiKey",
    "anthropicKey",
    "mcpUrl",
    "mcpTool",
    "mcpArg",
    "ollamaKeepAlive",
  ];
  const patch: SaveBody = { enabled: body.enabled };
  for (const k of keep) {
    if (body[k] !== undefined) (patch as unknown as Record<string, string>)[k] = body[k];
  }
  try {
    saveAIConfig(patch);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
  return NextResponse.json(await aiState());
}