import { NextResponse } from "next/server";
import { getMarkets } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const markets = await getMarkets();
  return NextResponse.json({ markets });
}
