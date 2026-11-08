import { z } from "zod"

import { ApplicationError } from "../../application/errors"
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MONEY_AMOUNT,
  MAX_NAME_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
  MAX_URL_LENGTH,
} from "../../application/mutations"
import {
  formatDateToIsoDate,
  parseCalendarDate,
  serializeCalculatedMoney,
  serializeDecimal,
  serializeTimestamp,
} from "../../application/serialization"
import { MCP_MAX_FILTER_LENGTH } from "../constants"

/**
 * Enum values are listed literally instead of derived from the Prisma runtime
 * enums, so a schema edit cannot silently widen or narrow a published tool
 * contract. `shared.test.ts` compares these lists against the generated enums,
 * so a schema change fails a test rather than a production response.
 */
export const ITEM_STATUSES = ["PENDING", "PURCHASED", "SKIPPED"] as const

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const

export const TIMEFRAMES = ["NOW", "SOON", "LATER", "SOMEDAY"] as const

export const PROJECT_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "ON_HOLD",
] as const

export const PROJECT_TYPES = [
  "MAINTENANCE",
  "REPAIR",
  "RENOVATION",
  "IMPROVEMENT",
  "OTHER",
] as const

export const PROJECT_EXECUTIONS = ["SELF", "VENDOR", "MIXED"] as const

export const WATERING_NEEDS = ["LOW", "MEDIUM", "HIGH"] as const

export const WATERING_METHODS = ["MANUAL", "AUTOMATIC"] as const

export const SUN_NEEDS = ["FULL_SUN", "PARTIAL_SHADE", "SHADE"] as const

export const PLANT_TYPES = [
  "TREE",
  "SHRUB",
  "PERENNIAL",
  "ANNUAL",
  "FLOWER",
  "HERB",
  "VEGETABLE",
  "CLIMBER",
  "GRASS",
  "OTHER",
] as const

export const LIFECYCLES = ["ANNUAL", "BIENNIAL", "PERENNIAL"] as const

export const BUDGET_ENTRY_TYPES = [
  "INCOME",
  "EXPENSE",
  "DEDUCTION",
  "SAVINGS",
] as const

export const BUDGET_FREQUENCIES = [
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "YEARLY",
] as const

export const BUDGET_LOAN_TYPES = [
  "MORTGAGE",
  "STUDENT",
  "CAR",
  "CONSUMER",
  "OTHER",
] as const

export const BUDGET_LOAN_REPAYMENT_TYPES = ["ANNUITY", "SERIAL"] as const

export const TRIP_TRANSPORT_TYPES = ["AIR_OR_PUBLIC", "CAR"] as const

// ─── Field schemas ──────────────────────────────────────────────

export const idSchema = z.string().uuid()

export const filterTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(MCP_MAX_FILTER_LENGTH)

export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Bruk formatet YYYY-MM-DD")

/** Stored `Decimal` columns keep full precision as a decimal string. */
export const storedMoneySchema = z
  .string()
  .nullable()
  .describe("Amount in NOK as a decimal string, or null.")

/**
 * Aggregates are float-derived by ADR 0001 and rounded to two decimals at the
 * boundary, so a client never sees the binary noise underneath.
 */
export const calculatedMoneySchema = z
  .string()
  .describe("Calculated amount in NOK, rounded to two decimals.")

export const timestampSchema = z.string().describe("ISO 8601 timestamp in UTC.")

export const calendarDateOutputSchema = z
  .string()
  .nullable()
  .describe("Calendar date as YYYY-MM-DD in UTC, or null.")

// ─── Serialization helpers ──────────────────────────────────────

type DecimalLike = { toString(): string; toNumber(): number }

export function money(value: DecimalLike | null | undefined) {
  return serializeDecimal(value)
}

export function calculated(value: number) {
  return serializeCalculatedMoney(value)
}

export function timestamp(value: Date) {
  return serializeTimestamp(value)
}

export function optionalTimestamp(value: Date | null | undefined) {
  return value ? serializeTimestamp(value) : null
}

export function calendarDate(value: Date | null | undefined) {
  return value ? formatDateToIsoDate(value) : null
}

export function parseFilterDate(value: string | undefined, fieldName: string) {
  return value ? parseCalendarDate(value, fieldName) : undefined
}

export function toNumber(value: DecimalLike | null | undefined) {
  return value == null ? 0 : value.toNumber()
}

/**
 * Guard for tools that take an id. Prisma throws on a malformed UUID, and that
 * error would surface as an internal failure rather than the validation error
 * the client can act on.
 */
export function assertId(value: string, fieldName: string) {
  if (!z.string().uuid().safeParse(value).success) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      `${fieldName} må være en gyldig ID.`
    )
  }

  return value
}

// ─── Write input schemas ────────────────────────────────────────
//
// Shape checks only. Length, range and enum rules are enforced again by the
// application write services, which are the contract for web and MCP alike;
// the limits here mirror them so a client learns about a violation from the
// schema before it reaches the service.

export const nameInputSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH)

/** Optional text field. Omit to leave unchanged; `null` or "" clears it. */
export const shortTextInputSchema = z
  .string()
  .max(MAX_SHORT_TEXT_LENGTH)
  .nullable()
  .optional()

export const longTextInputSchema = z
  .string()
  .max(MAX_LONG_TEXT_LENGTH)
  .nullable()
  .optional()

export const urlInputSchema = z
  .string()
  .max(MAX_URL_LENGTH)
  .nullable()
  .optional()
  .describe(
    "Absolute http(s) URL, stored as data. The server never fetches it."
  )

export const moneyInputSchema = z
  .number()
  .nonnegative()
  .max(MAX_MONEY_AMOUNT)
  .describe("Amount in NOK. Rounded to two decimals.")

export const calendarDateInputSchema = calendarDateSchema

export const timestampInputSchema = z
  .string()
  .datetime({ offset: true })
  .describe("ISO 8601 timestamp, e.g. 2026-05-01T08:00:00Z.")

export const expectedUpdatedAtSchema = z
  .string()
  .datetime({ offset: true })
  .optional()
  .describe(
    "The updatedAt value from your last read. If the resource has changed since, the call fails with CONFLICT instead of overwriting the newer change."
  )

export function parseExpectedUpdatedAt(value: string | undefined) {
  return value ? new Date(value) : undefined
}
