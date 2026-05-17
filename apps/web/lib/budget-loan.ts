export type BudgetLoanRepaymentType = "ANNUITY" | "SERIAL"

export interface LoanCalculationInput {
  principalAmount: number
  annualInterestRate: number
  termMonths: number
  repaymentType: BudgetLoanRepaymentType
}

export interface LoanMonthlyAmounts {
  monthlyInterest: number
  monthlyPrincipal: number
  monthlyPayment: number
}

const ZERO: LoanMonthlyAmounts = {
  monthlyInterest: 0,
  monthlyPrincipal: 0,
  monthlyPayment: 0,
}

export function calculateLoanMonthlyAmounts(
  input: LoanCalculationInput
): LoanMonthlyAmounts {
  const { principalAmount, annualInterestRate, termMonths, repaymentType } =
    input

  if (
    !isFinite(principalAmount) ||
    !isFinite(annualInterestRate) ||
    !isFinite(termMonths) ||
    principalAmount <= 0 ||
    termMonths <= 0
  ) {
    return ZERO
  }

  const monthlyRate = annualInterestRate / 100 / 12
  const monthlyPrincipal = principalAmount / termMonths

  if (repaymentType === "SERIAL") {
    const averageInterest =
      monthlyRate > 0
        ? (principalAmount * monthlyRate * (termMonths + 1)) / (2 * termMonths)
        : 0
    return {
      monthlyInterest: averageInterest,
      monthlyPrincipal,
      monthlyPayment: monthlyPrincipal + averageInterest,
    }
  }

  if (monthlyRate === 0) {
    return {
      monthlyInterest: 0,
      monthlyPrincipal,
      monthlyPayment: monthlyPrincipal,
    }
  }

  const growth = Math.pow(1 + monthlyRate, termMonths)
  const monthlyPayment =
    (principalAmount * (monthlyRate * growth)) / (growth - 1)
  const totalInterest = monthlyPayment * termMonths - principalAmount

  return {
    monthlyInterest: totalInterest / termMonths,
    monthlyPrincipal,
    monthlyPayment,
  }
}
