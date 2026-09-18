import { NextResponse } from "next/server";
import { getDb, setSetting } from "@/lib/db";
import { screenshotTheme, type ScreenshotTheme } from "@/lib/screenshots";

export const dynamic = "force-dynamic";

const THEMES: ScreenshotTheme[] = ["dark", "light"];
const KEY = "screenshot_theme";

/** GET /api/settings/screenshot-theme — the configured screenshot theme. */
export function GET() {
  return NextResponse.json({ theme: screenshotTheme() });
}

/** POST /api/settings/screenshot-theme — { theme: "dark" | "light" }. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { theme?: unknown };
  const theme = body.theme as ScreenshotTheme;
  if (!THEMES.includes(theme)) {
    return NextResponse.json(
      { error: 'theme must be "dark" or "light"' },
      { status: 400 }
    );
  }
  // Store "dark" explicitly too (setSetting deletes empty strings only).
  setSetting(getDb(), KEY, theme);
  return NextResponse.json({ ok: true, theme });
}
