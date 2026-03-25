import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const publicPaths = ["/login", "/login/verify", "/shared", "/api/auth"]

const middleware = auth((req) => {
  const { pathname } = req.nextUrl

  const isPublic = publicPaths.some((path) => pathname.startsWith(path))

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export default middleware as (req: NextRequest) => Promise<NextResponse>

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
