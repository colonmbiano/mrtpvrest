import { NextRequest, NextResponse } from "next/server";

// SaaS (SUPER_ADMIN) protected paths
const SAAS_PATHS = ["/dashboard", "/marcas", "/ajustes", "/facturacion", "/logs", "/api-keys"];

// Admin (ADMIN/KITCHEN) protected paths — prefix match
const ADMIN_PREFIX = "/admin";

// Public paths — always allowed
const PUBLIC_PATHS = ["/login", "/register", "/onboarding", "/saas/login", "/_next", "/favicon", "/logo", "/api"];

function getRole(req: NextRequest): string | null {
  return req.cookies.get("mb-role")?.value ?? null;
}

function isSaasPath(pathname: string) {
  return SAAS_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isAdminPath(pathname: string) {
  return pathname === ADMIN_PREFIX || pathname.startsWith(ADMIN_PREFIX + "/");
}

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let public and static routes through immediately
  if (isPublic(pathname)) return NextResponse.next();

  // KDS and repartidor are handled by their own auth
  if (pathname.startsWith("/kds") || pathname.startsWith("/repartidor")) return NextResponse.next();

  const role = getRole(req);

  // No cookie → redirect to login
  if (!role) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // SUPER_ADMIN: allow SaaS paths, block admin-only paths
  if (role === "SUPER_ADMIN") {
    if (isAdminPath(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // ADMIN / KITCHEN: allow admin paths, block SaaS paths
  if (role === "ADMIN" || role === "KITCHEN") {
    if (isSaasPath(pathname)) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  // Unknown role → login
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, logo.png (static assets)
     */
    "/((?!_next/static|_next/image|favicon.ico|logo.png|manifest).*)",
  ],
};
