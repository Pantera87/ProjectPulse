import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { archivedVersionDir } from "@/lib/archive";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

/**
 * GET /api/sources/:id/archive?version=N&file=rel
 * Serve one archived asset file of a snapshot version (path-traversal-guarded).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const sourceId = Number(id);
  const version = Number(url.searchParams.get("version") ?? 0);
  const file = url.searchParams.get("file") ?? "";
  if (
    !Number.isInteger(sourceId) ||
    !Number.isInteger(version) ||
    version < 1 ||
    !file ||
    file.includes("\0")
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const base = archivedVersionDir(sourceId, version);
  const abs = path.resolve(`${base}/${file}`);
  if (!abs.startsWith(base + path.sep)) {
    return NextResponse.json({ error: "Bad file" }, { status: 400 });
  }
  let buf: Buffer;
  try {
    buf = fs.readFileSync(abs);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ext = path.extname(abs).toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "cache-control": "no-store",
      // The snapshot viewer renders archived HTML in a sandboxed iframe,
      // which gives the document an opaque origin. Pages that load their
      // CSS/JS with crossorigin="anonymous" (e.g. GitHub) then issue CORS
      // requests for these assets — without a wildcard origin the browser
      // blocks them and the snapshot renders unstyled.
      "access-control-allow-origin": "*",
    },
  });
}