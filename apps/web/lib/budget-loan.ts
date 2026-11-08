export type BudgetLoanRepaymentType = "ANNUITY" | "SERIAL"

export interface LoanCalculationInput {
  /** Today's remaining balance. */
  principalAmount: number
  annualInterestRate: number
  /** Remaining term in months. */
  termMonths: number
  repaymentType: BudgetLoanRepaymentType
}

export interface LoanMonthlyAmounts {
  /** Average monthly interest over the next twelve months (or the rest of the term). */
  monthlyInterest: number
  /** Average monthly principal over the same period. */
  monthlyPrincipal: number
  /** `monthlyInterest + monthlyPrincipal`, without fees. */
  monthlyPayment: number
  /** The payment due this month, without fees. */
  firstPayment: number
  /** Interest still to pay if the loan runs its full remaining term. */
  remainingInterest: number
}

const ZERO: LoanMonthlyAmounts = {
  monthlyInterest: 0,
  monthlyPrincipal: 0,
  monthlyPayment: 0,
  firstPayment: 0,
  remainingInterest: 0,
}

/** The budget is a one-year view, so interest is averaged over that horizon. */
const HORIZON_MONTHS = 12

/**
 * Splits a loan's payments into interest and principal, starting from today's
 * balance.
 *
 * Interest is charged on what is still owed, so it is highest now and falls
 * as the loan is paid down. Averaging over the next twelve months gives the
 * interest the household will actually pay this year, which is also what the
 * interest deduction is based on. (Earlier versions averaged over the whole
 * remaining term, which understated interest and overstated principal for
 * long mortgages.)
 */
export function calculateLoanMonthlyAmounts(
  input: LoanCalculationInput
): LoanMonthlyAmounts {
  const { principalAmount, annualInterestRate, repaymentType } = input
  const termMonths = Math.round(input.termMonths)

  if (
    !isFinite(principalAmount) ||
    !isFinite(annualInterestRate) ||
    !isFinite(termMonths) ||
    principalAmount <= 0 ||
    termMonths <= 0 ||
    annualInterestRate < 0
  ) {
    return ZERO
  }

  const rate = annualInterestRate / 100 / 12
  const annuityPayment =
    rate === 0
      ? principalAmount / termMonths
      : (principalAmount * rate) / (1 - Math.pow(1 + rate, -termMonths))
  const serialPrincipal = principalAmount / termMonths

  const horizon = Math.min(HORIZON_MONTHS, termMonths)
  let balance = principalAmount
  let horizonInterest = 0
  let horizonPrincipal = 0
  let remainingInterest = 0
  let firstPayment = 0

  for (let month = 0; month < termMonths; month++) {
    const interest = balance * rate
    const principal =
      repaymentType === "SERIAL"
        ? serialPrincipal
        : Math.min(annuityPayment - interest, balance)

    if (month === 0) firstPayment = interest + principal
    if (month < horizon) {
      horizonInterest += interest
      horizonPrincipal += principal
    }

    remainingInterest += interest
    balance -= principal
  }

  const monthlyInterest = horizonInterest / horizon
  const monthlyPrincipal = horizonPrincipal / horizon

  return {
    monthlyInterest,
    monthlyPrincipal,
    monthlyPayment: monthlyInterest + monthlyPrincipal,
    firstPayment,
    remainingInterest,
  }
}
