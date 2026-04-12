import { NextRequest, NextResponse } from "next/server"

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || ""
  const slug = host.split(".")[0]

  const SYSTEM = ["www", "localhost", "127", "vercel", "mrtpvrest"]
  if (SYSTEM.some(s => slug.startsWith(s))) return NextResponse.next()

  const res = NextResponse.next()
  res.headers.set("x-store-slug", slug)
  return res
}

export const config = {
  matcher: ["/((?!_next|favicon|api).*)"],
}
