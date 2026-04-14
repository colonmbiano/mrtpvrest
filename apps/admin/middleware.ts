import { NextRequest, NextResponse } from "next/server";

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

  // SUPER_ADMIN ya no tiene panel aquí → redirigir a saas app
  if (role === "SUPER_ADMIN") {
    const saasUrl = process.env.NEXT_PUBLIC_SAAS_URL || "http://localhost:3005";
    return NextResponse.redirect(new URL("/dashboard", saasUrl));
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
