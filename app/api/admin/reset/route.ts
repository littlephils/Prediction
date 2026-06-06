import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { resetAll } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await resetAll();
  return NextResponse.json({ ok: true });
}
