/*
 * The optional budget fields: what they are called, which rows they apply to
 * and whether an empty one is worth filling in.
 *
 * The page uses this to show filled details and, on request, the empty fields
 * a row could have. MCP reports the same empty fields as `missingFields`, so
 * an assistant knows what to ask about or look up. Keeping it in one place
 * means the two never disagree. Pure data, safe for client components.
 */

type Row = Record<string, unknown>

export type BudgetOptionalField = {
  key: string
  label: string
  /** Shown with the empty field, to say what the field is for. */
  hint: string
  /** Rows the field makes sense for. Defaults to every row. */
  appliesTo?: (row: Row) => boolean
  /**
   * False for free text such as notes: an empty note is not a gap. Such a
   * field is shown when filled but never reported as missing.
   */
  reportWhenEmpty?: boolean
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === ""
}

export const BUDGET_MEMBER_OPTIONAL_FIELDS: BudgetOptionalField[] = [
  {
    key: "netMonthlyIncome",
    label: "Utbetalt netto",
    hint: "Faktisk utbetaling fra lønnsslippen. Brukes i stedet for skatteprosenten.",
  },
  {
    key: "notes",
    label: "Notat",
    hint: "Fritekst",
    reportWhenEmpty: false,
  },
]

export const BUDGET_LOAN_OPTIONAL_FIELDS: BudgetOptionalField[] = [
  {
    key: "fixedRateUntil",
    label: "Fastrente til",
    hint: "Når fastrenteperioden slutter",
    appliesTo: (loan) => loan.loanType === "MORTGAGE",
  },
  {
    key: "notes",
    label: "Notat",
    hint: "Fritekst",
    reportWhenEmpty: false,
  },
]

export const BUDGET_TRIP_OPTIONAL_FIELDS: BudgetOptionalField[] = [
  {
    key: "otherPerTrip",
    label: "Andre kostnader",
    hint: "Parkering, overnatting o.l. per reise",
  },
  {
    key: "notes",
    label: "Notat",
    hint: "Fritekst",
    reportWhenEmpty: false,
  },
]

const paysSomeone = (entry: Row) =>
  entry.type === "EXPENSE" || entry.type === "SAVINGS"

export const BUDGET_ENTRY_OPTIONAL_FIELDS: BudgetOptionalField[] = [
  {
    key: "provider",
    label: "Leverandør",
    hint: "Hvem pengene går til, f.eks. strømselskap eller forsikring",
    appliesTo: paysSomeone,
  },
  {
    key: "paymentDay",
    label: "Trekkdag",
    hint: "Dag i måneden beløpet trekkes eller kommer inn",
  },
  {
    key: "renewalDate",
    label: "Bindingstid til",
    hint: "Når avtalen kan sies opp eller fornyes",
    appliesTo: (entry) => entry.type === "EXPENSE",
  },
  {
    key: "notes",
    label: "Notat",
    hint: "Fritekst",
    reportWhenEmpty: false,
  },
]

/** Budget-wide fields. The row is `{ propertyValue, hasMortgage }`. */
export const BUDGET_SETTINGS_OPTIONAL_FIELDS: BudgetOptionalField[] = [
  {
    key: "propertyValue",
    label: "Boligverdi",
    hint: "Gir belåningsgrad for boliglånet",
    appliesTo: (budget) => budget.hasMortgage === true,
  },
]

/** Any budget row: a Prisma row, a serialized page row or a settings object. */
type AnyRow = object

const valueOf = (row: AnyRow, key: string) => (row as Row)[key]

export function applicableFields(fields: BudgetOptionalField[], row: AnyRow) {
  return fields.filter((field) => field.appliesTo?.(row as Row) ?? true)
}

/** Applicable fields with a value, in definition order. */
export function filledFields(fields: BudgetOptionalField[], row: AnyRow) {
  return applicableFields(fields, row).filter(
    (field) => !isEmpty(valueOf(row, field.key))
  )
}

/** Applicable, reportable fields without a value. */
export function emptyFields(fields: BudgetOptionalField[], row: AnyRow) {
  return applicableFields(fields, row).filter(
    (field) =>
      field.reportWhenEmpty !== false && isEmpty(valueOf(row, field.key))
  )
}

export function missingFieldKeys(fields: BudgetOptionalField[], row: AnyRow) {
  return emptyFields(fields, row).map((field) => field.key)
}

export function fieldValue(row: AnyRow, key: string) {
  return valueOf(row, key)
}
