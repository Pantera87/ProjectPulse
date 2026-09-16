import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const password = process.env.AUTH_PASSWORD;
  if (!password)
    return NextResponse.json({ ok: false, error: "Auth not enabled" }, { status: 400 });
  try {
    const body = (await req.json()) as { password?: string };
    const hash = createHash("sha256").update(body.password ?? "").digest("hex");
    if (hash !== createHash("sha256").update(password).digest("hex"))
      return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
    const store = await cookies();
    store.set("pp_session", hash, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE() {
  const store = await cookies();
  store.delete("pp_session");
  return NextResponse.json({ ok: true });
}
