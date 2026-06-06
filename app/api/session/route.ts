import { NextRequest, NextResponse } from "next/server";
import { ensureUser } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const user = await ensureUser(body?.username);
  if (!user) {
    return NextResponse.json(
      { error: "Pick a name (1–24 chars: letters, numbers, spaces)." },
      { status: 400 },
    );
  }
  return NextResponse.json({ name: user.name, balance: user.balance });
}
