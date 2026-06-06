import { NextRequest, NextResponse } from "next/server";
import { placeBet } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await placeBet(body?.username, body?.marketId, body?.amount);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    balance: result.balance,
    lockedOdds: result.lockedOdds,
    amount: result.amount,
    market: result.market,
  });
}
