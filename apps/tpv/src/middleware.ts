import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Rutas del kiosko: públicas (no requieren autenticación de cajero)
const PUBLIC_PATHS = ["/kiosk"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // El kiosko es acceso público desde tablets sin sesión de cajero
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/).*)",
  ],
};
