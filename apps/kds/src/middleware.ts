import { NextRequest, NextResponse } from 'next/server';

// Roles autorizados por path (defensa en profundidad — el backend sigue
// siendo la verdadera autoridad con requireRole en cada endpoint).
// Si el rol no machea, redirigimos a /hub donde el usuario verá solo lo
// que sí puede usar.
const PATH_ROLES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/kds',     roles: ['COOK', 'KITCHEN', 'ADMIN', 'OWNER', 'MANAGER', 'SUPER_ADMIN'] },
  { prefix: '/cierre',  roles: ['CASHIER', 'ADMIN', 'OWNER', 'MANAGER', 'SUPER_ADMIN'] },
  { prefix: '/pos',     roles: ['CASHIER', 'WAITER', 'ADMIN', 'OWNER', 'MANAGER', 'SUPER_ADMIN'] },
  // /hub y /meseros no se restringen a un rol concreto — son selectores.
];

function roleAllowed(pathname: string, role: string | null): boolean {
  const rule = PATH_ROLES.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return true;
  if (!role) return false;
  return rule.roles.includes(role);
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const device = request.cookies.get('tpv-device-linked');
  const session = request.cookies.get('tpv-session-active');
  const roleCookie = request.cookies.get('tpv-role')?.value;
  const role = roleCookie ? decodeURIComponent(roleCookie) : null;

  // Root: redirigir según estado de auth (evita prerender roto en page.tsx)
  if (pathname === '/') {
    if (!device) return NextResponse.redirect(new URL('/setup', request.url));
    if (!session) return NextResponse.redirect(new URL('/locked', request.url));
    return NextResponse.redirect(new URL('/hub', request.url));
  }

  // Setup route: allow anyone
  if (pathname.startsWith('/setup')) {
    return NextResponse.next();
  }

  // Locked route: require device
  if (pathname.startsWith('/locked')) {
    if (!device) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }
    return NextResponse.next();
  }

  // Rutas autenticadas: device + session
  if (
    pathname.startsWith('/hub') ||
    pathname.startsWith('/pos') ||
    pathname.startsWith('/kds') ||
    pathname.startsWith('/cierre') ||
    pathname.startsWith('/meseros')
  ) {
    if (!device) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }
    if (!session) {
      return NextResponse.redirect(new URL('/locked', request.url));
    }
    if (!roleAllowed(pathname, role)) {
      return NextResponse.redirect(new URL('/hub', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/setup/:path*',
    '/locked/:path*',
    '/hub/:path*',
    '/pos/:path*',
    '/kds/:path*',
    '/cierre/:path*',
    '/meseros/:path*',
  ],
};
