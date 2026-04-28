import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const publicPaths = ["/login", "/login/verify", "/shared", "/api/auth"]
const publicAssetPrefixes = ["/icon", "/apple-icon"]
const publicAssetPaths = ["/favicon.ico", "/manifest.webmanifest", "/sw.js"]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isPublic =
    publicPaths.some((path) => pathname.startsWith(path)) ||
    publicAssetPrefixes.some((path) => pathname.startsWith(path)) ||
    publicAssetPaths.includes(pathname)

  // Only check for session cookie presence here (edge-compatible).
  // Full session validation happens server-side via auth() in pages/actions.
  const hasSession =
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token")

  if (!hasSession && !isPublic) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
