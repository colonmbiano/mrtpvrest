import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Get cookies for device linking and session state
  const deviceLinkedCookie = request.cookies.get('tpv-device-linked');
  const sessionActiveCookie = request.cookies.get('tpv-session-active');

  const isDeviceLinked = deviceLinkedCookie?.value === 'true';
  const isSessionActive = sessionActiveCookie?.value === 'true';

  // Rule 1: /setup routes - always allowed (no auth required)
  // If already linked, redirect to appropriate next step
  if (pathname.startsWith('/setup')) {
    if (isDeviceLinked && isSessionActive) {
      return NextResponse.redirect(new URL('/pos/order-type', request.url));
    }
    if (isDeviceLinked) {
      return NextResponse.redirect(new URL('/locked', request.url));
    }
    return NextResponse.next();
  }

  // Rule 2: /locked routes - requires device linking
  // Protects routes that need device identification but not user session
  if (pathname.startsWith('/locked')) {
    if (!isDeviceLinked) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }
    // If already has session, redirect to POS
    if (isSessionActive) {
      return NextResponse.redirect(new URL('/pos/order-type', request.url));
    }
    return NextResponse.next();
  }

  // Rule 3: /pos and /kds routes - require BOTH device + session
  // These are operational routes that need full authentication
  if (pathname.startsWith('/pos') || pathname.startsWith('/kds')) {
    if (!isDeviceLinked) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }
    if (!isSessionActive) {
      return NextResponse.redirect(new URL('/locked', request.url));
    }
    return NextResponse.next();
  }

  // Rule 4: /admin routes - pass through (can add auth later)
  // Admin routes are protected separately via different auth mechanisms
  if (pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // Default: allow other routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match specific route patterns
    '/setup/:path*',
    '/locked/:path*',
    '/pos/:path*',
    '/kds/:path*',
    '/admin/:path*',
  ],
};
