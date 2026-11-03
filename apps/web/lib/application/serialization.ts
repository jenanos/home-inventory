import { ApplicationError } from "./errors"

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

type DecimalLike = {
  toString(): string
}

function assertValidDate(date: Date, fieldName: string): void {
  if (Number.isNaN(date.getTime())) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      `${fieldName} må være en gyldig dato.`
    )
  }
}

export function parseCalendarDate(value: string, fieldName = "Dato"): Date {
  const match = CALENDAR_DATE_PATTERN.exec(value)
  if (!match) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      `${fieldName} må ha formatet YYYY-MM-DD.`
    )
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      `${fieldName} må være en gyldig kalenderdato.`
    )
  }

  return date
}

export function formatDateToIsoDate(date: Date): string {
  assertValidDate(date, "Dato")
  return date.toISOString().slice(0, 10)
}

export function serializeTimestamp(date: Date): string {
  assertValidDate(date, "Tidspunkt")
  return date.toISOString()
}

export function serializeDecimal(
  value: DecimalLike | null | undefined
): string | null {
  return value == null ? null : value.toString()
}

export function serializeCalculatedMoney(value: number): string {
  if (!Number.isFinite(value)) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "Beregnet pengebeløp må være et endelig tall."
    )
  }

  const rounded =
    Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100
  return rounded.toFixed(2)
}

export function serializeEnum<T extends string>(value: T): T {
  return value
}
