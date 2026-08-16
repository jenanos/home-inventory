import { z } from "zod"

import { ApplicationError } from "../../application/errors"
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

export const PHASES = [
  "BEFORE_MOVE",
  "FIRST_WEEK",
  "CAN_WAIT",
  "NO_RUSH",
] as const

export const TASK_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "ON_HOLD",
] as const

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

export const BUDGET_ENTRY_TYPES = ["INCOME", "EXPENSE", "DEDUCTION"] as const

export const BUDGET_LOAN_TYPES = ["MORTGAGE", "OTHER"] as const

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
