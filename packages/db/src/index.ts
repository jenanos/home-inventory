import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}
const runtime = globalThis as typeof globalThis & {
  process?: {
    env?: { NODE_ENV?: string }
  }
}

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (runtime.process?.env?.NODE_ENV !== "production") globalForPrisma.prisma = db

export { PrismaClient }
export * from "@prisma/client"
