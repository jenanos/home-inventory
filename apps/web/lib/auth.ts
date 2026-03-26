import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { db } from "@workspace/db"
import Resend from "next-auth/providers/resend"

const config = {
  adapter: PrismaAdapter(db),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? "Home Inventory <noreply@resend.dev>",
      ...(process.env.NODE_ENV === "development" && {
        sendVerificationRequest({ url }) {
          console.log("\n════════════════════════════════════════")
          console.log("  🔗 Magic link sign-in URL (dev mode)")
          console.log("════════════════════════════════════════")
          console.log(`\n  ${url}\n`)
          console.log("════════════════════════════════════════\n")
        },
      }),
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
} satisfies NextAuthConfig

const nextAuth = NextAuth(config)

export const handlers: typeof nextAuth.handlers = nextAuth.handlers
export const auth: typeof nextAuth.auth = nextAuth.auth
export const signIn: typeof nextAuth.signIn = nextAuth.signIn
export const signOut: typeof nextAuth.signOut = nextAuth.signOut
