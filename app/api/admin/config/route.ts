import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { ODDS_FLOOR, ODDS_K } from "@/lib/odds";
import { STARTING_BALANCE, storageLabel } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    storage: storageLabel(),
    oddsK: ODDS_K,
    oddsFloor: ODDS_FLOOR,
    startingBalance: STARTING_BALANCE,
    pollMs: 2500,
  });
}
