import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optional auth gate (edge-safe). If AUTH_PASSWORD env is set, all routes
 * (except /login and /api/auth) require a session cookie whose value is the
 * sha256 hex of the password. Leave AUTH_PASSWORD unset for open LAN access.
 */
async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function proxy(req: NextRequest) {
  const password = process.env.AUTH_PASSWORD;
  if (!password) return NextResponse.next();

  const expected = await sha256Hex(password);
  const cookie = req.cookies.get("pp_session")?.value;
  if (cookie === expected) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/auth")) return NextResponse.next();
  if (pathname === "/login") return NextResponse.next();

  const url = new URL("/login", req.url);
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
