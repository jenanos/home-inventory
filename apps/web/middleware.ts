import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// MCP clients authenticate with a bearer token and never have an Auth.js
// cookie, so these paths must reach their route handlers. "Public" here only
// means middleware lets the request through — every one of these routes still
// runs its own full authentication.
//
// The trailing slash on "/api/oauth/" matters: `startsWith` would otherwise
// also match an unrelated path such as "/api/oauthfoo".
const publicPaths = [
  "/login",
  "/login/verify",
  "/shared",
  "/api/auth",
  "/api/oauth/",
  "/.well-known/",
]
const exactPublicPaths = ["/api/mcp"]
const publicAssetPrefixes = ["/icon", "/apple-icon"]
const publicAssetPaths = ["/favicon.ico", "/manifest.webmanifest", "/sw.js"]

export function isPublicPathname(pathname: string) {
  return (
    exactPublicPaths.includes(pathname) ||
    publicPaths.some((path) => pathname.startsWith(path)) ||
    publicAssetPrefixes.some((path) => pathname.startsWith(path)) ||
    publicAssetPaths.includes(pathname)
  )
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isPublic = isPublicPathname(pathname)

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
