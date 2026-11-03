import { Prisma } from "@workspace/db"

import { ApplicationError } from "./errors"
import { parseCalendarDate } from "./serialization"

/**
 * Shared rules for every write service. They live in the application layer, not
 * in an adapter, so the web flow and MCP get the same contract for the same
 * operation (plan 9.1).
 */

/** Upper bound for any batch operation, web or MCP. */
export const MAX_BATCH_SIZE = 100

export const MAX_NAME_LENGTH = 200
export const MAX_SHORT_TEXT_LENGTH = 500
export const MAX_LONG_TEXT_LENGTH = 10_000
export const MAX_URL_LENGTH = 2048

/** `Decimal(10, 2)`: the widest amount the money columns can hold. */
export const MAX_MONEY_AMOUNT = 99_999_999.99

// ─── Errors ─────────────────────────────────────────────────────

/**
 * Same message for an unknown id and for a resource outside the caller's
 * boundary, so the two cannot be told apart (plan 9.4).
 */
export function notFound(resource: string) {
  return new ApplicationError(
    "NOT_FOUND",
    `Fant ingen ${resource} med den ID-en.`
  )
}

export function validationError(message: string) {
  return new ApplicationError("VALIDATION_ERROR", message)
}

export function staleWriteConflict(resource: string) {
  return new ApplicationError(
    "CONFLICT",
    `${capitalize(resource)} er endret siden den ble lest. Hent den på nytt og prøv igjen.`
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function isRecordNotFoundError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  )
}

export function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
}

/**
 * Runs a write whose `where` already carries the ownership boundary, so
 * authorization is part of the statement rather than a separate check before
 * it (plan chapter 7). Prisma reports a non-matching `where` as P2025; that is
 * translated to NOT_FOUND, or to CONFLICT when the row exists but
 * `expectedUpdatedAt` no longer matches.
 */
export async function scopedWrite<T>(options: {
  resource: string
  write: () => Promise<T>
  /** Only consulted when `expectedUpdatedAt` was supplied and the write missed. */
  existsInScope?: () => Promise<boolean>
  expectedUpdatedAt?: Date
}): Promise<T> {
  try {
    return await options.write()
  } catch (error) {
    if (!isRecordNotFoundError(error)) {
      throw error
    }

    if (options.expectedUpdatedAt && (await options.existsInScope?.())) {
      throw staleWriteConflict(options.resource)
    }

    throw notFound(options.resource)
  }
}

/** Adds the optimistic concurrency guard to a `where` when one was given. */
export function freshness(expectedUpdatedAt: Date | undefined) {
  return expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}
}

// ─── Field normalization ────────────────────────────────────────

function assertLength(value: string, field: string, max: number) {
  if (value.length > max) {
    throw validationError(`${field} kan være maks ${max} tegn.`)
  }
}

/** Trimmed, non-empty text. */
export function requiredText(
  value: string,
  field: string,
  max = MAX_NAME_LENGTH
): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw validationError(`${field} kan ikke være tom.`)
  }
  assertLength(trimmed, field, max)
  return trimmed
}

/**
 * `undefined` means "not supplied" and stays undefined, so an update leaves the
 * column alone. `null` and blank text both clear it (plan 9.1).
 */
export function optionalText(
  value: string | null | undefined,
  field: string,
  max = MAX_SHORT_TEXT_LENGTH
): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  assertLength(trimmed, field, max)
  return trimmed
}

/**
 * Only absolute http(s) URLs are stored. They are data: the server never
 * fetches them (plan 11.17). An invalid URL is rejected rather than dropped,
 * so the caller learns that it was not saved.
 */
export function optionalUrl(
  value: string | null | undefined,
  field: string
): string | null | undefined {
  const text = optionalText(value, field, MAX_URL_LENGTH)
  if (text == null) return text

  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    throw validationError(`${field} må være en gyldig URL.`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw validationError(`${field} må bruke http eller https.`)
  }

  return text
}

/**
 * Lenient variant for the bulk import flows, which take pasted LLM output: an
 * unusable URL is dropped instead of failing the whole import. This is the
 * behaviour those flows have always had.
 */
export function lenientUrl(
  value: string | null | undefined
): string | undefined {
  try {
    return optionalUrl(value, "URL") ?? undefined
  } catch {
    return undefined
  }
}

function assertFiniteNumber(value: number, field: string) {
  if (!Number.isFinite(value)) {
    throw validationError(`${field} må være et tall.`)
  }
}

/** Non-negative NOK amount with at most two decimals. */
export function moneyAmount(
  value: number,
  field: string,
  max = MAX_MONEY_AMOUNT
): number {
  assertFiniteNumber(value, field)
  if (value < 0) {
    throw validationError(`${field} kan ikke være negativ.`)
  }
  if (value > max) {
    throw validationError(`${field} kan være maks ${max}.`)
  }
  return Math.round(value * 100) / 100
}

export function optionalMoneyAmount(
  value: number | null | undefined,
  field: string,
  max = MAX_MONEY_AMOUNT
): number | null | undefined {
  if (value == null) return value
  return moneyAmount(value, field, max)
}

export function numberInRange(
  value: number,
  field: string,
  { min, max }: { min: number; max: number }
): number {
  assertFiniteNumber(value, field)
  if (value < min || value > max) {
    throw validationError(`${field} må være mellom ${min} og ${max}.`)
  }
  return value
}

export function integerInRange(
  value: number,
  field: string,
  range: { min: number; max: number }
): number {
  numberInRange(value, field, range)
  if (!Number.isInteger(value)) {
    throw validationError(`${field} må være et heltall.`)
  }
  return value
}

/** Accepts a `Date` from the web flow or `YYYY-MM-DD` from MCP. */
export function optionalCalendarDate(
  value: Date | string | null | undefined,
  field: string
): Date | null | undefined {
  if (value == null) return value
  if (typeof value === "string") return parseCalendarDate(value, field)
  if (Number.isNaN(value.getTime())) {
    throw validationError(`${field} må være en gyldig dato.`)
  }
  return value
}

export function optionalTimestampInput(
  value: Date | string | null | undefined,
  field: string
): Date | null | undefined {
  if (value == null) return value
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) {
    throw validationError(`${field} må være et gyldig tidspunkt.`)
  }
  return date
}

export function assertBatchSize(
  length: number,
  field: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
) {
  if (length === 0 && !allowEmpty) {
    throw validationError(`${field} kan ikke være tom.`)
  }
  if (length > MAX_BATCH_SIZE) {
    throw validationError(
      `${field} kan ha maks ${MAX_BATCH_SIZE} elementer per kall.`
    )
  }
}

/**
 * Validates an enum value at the service boundary. An unknown value is an
 * error, never a silent fallback (plan 9.1).
 */
export function enumValue<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string
): T {
  if ((allowed as readonly string[]).includes(value)) {
    return value as T
  }
  throw validationError(`${field} må være en av: ${allowed.join(", ")}.`)
}

/** Drops `undefined` keys so a Prisma update touches only supplied fields. */
export function definedFields<T extends Record<string, unknown>>(
  fields: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as Partial<T>
}
