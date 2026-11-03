import { z } from "zod"

import { ApplicationError } from "../application/errors"
import { MCP_DEFAULT_PAGE_SIZE, MCP_MAX_PAGE_SIZE } from "./constants"

const CURSOR_PREFIX = "offset:"

/**
 * Offset pagination behind an opaque cursor.
 *
 * The cursor is opaque so clients cannot start doing arithmetic on it, which
 * keeps the door open for a keyset cursor later without a contract change.
 * Every paged query pairs its sort with `id` as a tiebreaker, so the same
 * offset means the same row for an unchanged data set.
 */
export function encodeCursor(offset: number): string {
  return Buffer.from(`${CURSOR_PREFIX}${offset}`, "utf8").toString("base64url")
}

export function decodeCursor(cursor: string): number {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8")

  if (!decoded.startsWith(CURSOR_PREFIX)) {
    throw new ApplicationError("VALIDATION_ERROR", "Ugyldig cursor.")
  }

  const offset = Number(decoded.slice(CURSOR_PREFIX.length))
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new ApplicationError("VALIDATION_ERROR", "Ugyldig cursor.")
  }

  return offset
}

export const paginationInputSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(MCP_MAX_PAGE_SIZE)
    .optional()
    .describe(
      `Maximum number of items to return. Defaults to ${MCP_DEFAULT_PAGE_SIZE}, maximum ${MCP_MAX_PAGE_SIZE}.`
    ),
  cursor: z
    .string()
    .max(128)
    .optional()
    .describe(
      "Opaque cursor from a previous response's pageInfo.nextCursor. Omit for the first page."
    ),
}

export const pageInfoSchema = z.object({
  totalCount: z
    .number()
    .int()
    .describe("Total number of items matching the filter, ignoring paging."),
  returnedCount: z.number().int(),
  hasMore: z.boolean(),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pass back as `cursor` to fetch the next page, or null if done."),
})

export type PageRequest = {
  limit: number
  offset: number
}

export function resolvePageRequest(input: {
  limit?: number
  cursor?: string
}): PageRequest {
  return {
    limit: input.limit ?? MCP_DEFAULT_PAGE_SIZE,
    offset: input.cursor ? decodeCursor(input.cursor) : 0,
  }
}

export function buildPageInfo(
  page: PageRequest,
  returnedCount: number,
  totalCount: number
) {
  const consumed = page.offset + returnedCount
  const hasMore = consumed < totalCount

  return {
    totalCount,
    returnedCount,
    hasMore,
    nextCursor: hasMore ? encodeCursor(consumed) : null,
  }
}
