import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const leaderboard = await getLeaderboard(10);
  return NextResponse.json({ leaderboard });
}
