import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { createMarket, getMarkets } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ markets: await getMarkets() });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await createMarket({
    kind: body?.kind,
    word: body?.word,
    startingOdds: body?.startingOdds,
    icon: body?.icon,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ market: result });
}
