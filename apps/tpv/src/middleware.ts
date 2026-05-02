import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const device = request.cookies.get('tpv-device-linked');
  const session = request.cookies.get('tpv-session-active');

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

  // POS + KDS routes: require device + session
  if (pathname.startsWith('/pos') || pathname.startsWith('/kds')) {
    if (!device) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }
    if (!session) {
      return NextResponse.redirect(new URL('/locked', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/setup/:path*', '/locked/:path*', '/pos/:path*', '/kds/:path*'],
};
