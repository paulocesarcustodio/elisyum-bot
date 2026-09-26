import { NextResponse, type NextRequest } from "next/server";

const API_URL = process.env.BETTER_AUTH_URL || "http://localhost:3000";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/" ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  const response = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { cookie: request.headers.get("cookie") || "" },
  });

  if (!response.ok) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await response.json();
  if (!session || !session.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
