import { NextResponse } from "next/server";
import { search } from "@/lib/models";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2)
    return NextResponse.json({ sources: [], updates: [] });
  const result = search(q.trim());
  return NextResponse.json({
    sources: result.sources.map((s) => ({
      id: s.id,
      type: s.type,
      name: s.name,
      goal: s.goal,
      category: s.category,
      url: s.url,
    })),
    updates: result.updates,
  });
}
