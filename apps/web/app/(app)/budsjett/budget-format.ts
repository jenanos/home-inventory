import type {
  BudgetEntryType,
  BudgetFrequency,
  BudgetLoanType,
} from "@workspace/db"

export const ENTRY_TYPE_LABELS: Record<BudgetEntryType, string> = {
  INCOME: "Inntekt",
  EXPENSE: "Kostnad",
  DEDUCTION: "Fradrag",
  SAVINGS: "Sparing",
}

export const ENTRY_TYPE_TONE: Record<BudgetEntryType, string> = {
  INCOME: "text-green-700 dark:text-green-400",
  EXPENSE: "text-red-700 dark:text-red-400",
  DEDUCTION: "text-blue-700 dark:text-blue-400",
  SAVINGS: "text-violet-700 dark:text-violet-400",
}

export const FREQUENCY_LABELS: Record<BudgetFrequency, string> = {
  WEEKLY: "Per uke",
  MONTHLY: "Per måned",
  QUARTERLY: "Per kvartal",
  SEMIANNUAL: "Per halvår",
  YEARLY: "Per år",
}

/** Short suffix after an amount, e.g. "12 000 kr/år". */
export const FREQUENCY_SUFFIX: Record<BudgetFrequency, string> = {
  WEEKLY: "/uke",
  MONTHLY: "/mnd",
  QUARTERLY: "/kvartal",
  SEMIANNUAL: "/halvår",
  YEARLY: "/år",
}

export const LOAN_TYPE_LABELS: Record<BudgetLoanType, string> = {
  MORTGAGE: "Boliglån",
  STUDENT: "Studielån",
  CAR: "Billån",
  CONSUMER: "Forbrukslån/kreditt",
  OTHER: "Annet lån",
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits }).format(value)
}

/** `YYYY-MM-DD` as e.g. "1. mars 2027". */
export function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`))
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from today (UTC) until the date; negative once it has passed. */
export function daysUntil(isoDate: string, now = new Date()) {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - today) / DAY_MS)
}

/** Dates this close are flagged so a contract or fixed rate is not missed. */
export const SOON_DAYS = 60

/** Number input value to a number, or null when blank or invalid. */
export function parseOptionalNumber(value: string) {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function optionalString(value: string) {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}
