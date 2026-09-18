import { NextResponse } from "next/server";
import { displayTimezone } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Tells client components which timezone to render timestamps in, so the
 * display follows the TZ environment variable (docker-compose.yml) without
 * baking it into the image at build time.
 */
export function GET() {
  return NextResponse.json({ timezone: displayTimezone() });
}
