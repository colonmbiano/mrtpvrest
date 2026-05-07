import { NextRequest, NextResponse } from "next/server";
import { getSaasUrl } from "@/lib/config";

// Public paths — always allowed
const PUBLIC_PATHS = ["/login", "/register", "/verify-email", "/onboarding", "/_next", "/favicon", "/logo", "/api", "/.well-known"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();
  if (pathname.startsWith("/kds") || pathname.startsWith("/repartidor")) return NextResponse.next();

  const role = req.cookies.get("mb-role")?.value ?? null;

  if (!role) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // SUPER_ADMIN: panel principal vive en saas.mrtpvrest.com, pero las
  // rutas /super/* (observabilidad, logs, etc.) sí se sirven desde aquí
  // para no duplicar la lógica del dashboard de errores.
  if (role === "SUPER_ADMIN") {
    if (pathname.startsWith("/super")) return NextResponse.next();
    return NextResponse.redirect(new URL("/dashboard", getSaasUrl()));
  }

  // ADMIN / KITCHEN: solo acceden a rutas /admin
  if (role === "ADMIN" || role === "KITCHEN") {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|manifest|\\.well-known).*)",
  ],
};
