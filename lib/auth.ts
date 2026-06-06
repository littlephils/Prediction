import { NextRequest } from "next/server";

const ADMIN_KEY = process.env.ADMIN_KEY ?? "partytime";

/** Admin access is by obscurity only: a secret key in the URL or a header. */
export function isAdmin(req: NextRequest): boolean {
  const fromHeader = req.headers.get("x-admin-key");
  const fromQuery = req.nextUrl.searchParams.get("key");
  return (fromHeader ?? fromQuery) === ADMIN_KEY;
}
