import { NextRequest, NextResponse } from "next/server"

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone()
  const host = req.headers.get("host") || ""
  const slug = host.split(".")[0]

  const SYSTEM = ["www", "localhost", "127", "vercel", "mrtpvrest", "master-burguers-production"]
  
  // Si es un subdominio de sistema, no hacemos nada especial
  if (!slug || SYSTEM.some(s => slug.startsWith(s))) {
    return NextResponse.next()
  }

  // Si es un subdominio de cliente, reescribimos la ruta interna hacia /[slug]
  // para que Next.js use la carpeta apps/client/src/app/[slug]
  url.pathname = `/${slug}${url.pathname}`
  
  const res = NextResponse.rewrite(url)
  res.headers.set("x-store-slug", slug)
  return res
}

export const config = {
  matcher: ["/((?!_next|favicon|api).*)"],
}
