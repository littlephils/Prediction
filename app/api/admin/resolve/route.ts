import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { resolveMarket, type ResolveOutcome } from "@/lib/store";

export const dynamic = "force-dynamic";

const VALID: ResolveOutcome[] = ["spoken", "never", "void"];

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const outcome = body?.outcome as ResolveOutcome;
  if (!VALID.includes(outcome)) {
    return NextResponse.json({ error: "Invalid outcome." }, { status: 400 });
  }
  const result = await resolveMarket(body?.marketId, outcome);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ market: result.market });
}
