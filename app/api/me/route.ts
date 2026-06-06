import { NextRequest, NextResponse } from "next/server";
import { getMarkets, getUser, normalizeName, settleBets } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const name = normalizeName(req.nextUrl.searchParams.get("username"));
  if (!name) return NextResponse.json({ error: "Missing username." }, { status: 400 });

  const user = await getUser(name.id);
  if (!user) return NextResponse.json({ error: "Unknown user." }, { status: 404 });

  const markets = await getMarkets();
  return NextResponse.json({
    name: user.name,
    balance: user.balance,
    bets: settleBets(user.bets, markets),
  });
}
