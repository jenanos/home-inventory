import { requireHousehold } from "@/lib/session"
import { ensureBudget } from "@/lib/actions/budget"
import { getBudget } from "@/lib/queries/budget"
import { BudgetLlmImportPageClient } from "../llm-import-page-client"

export default async function BudgetLlmImportPage() {
  const { membership } = await requireHousehold()
  await ensureBudget()
  const budget = await getBudget(membership.householdId)

  return (
    <BudgetLlmImportPageClient
      existingData={{
        members:
          budget?.members.map((member) => ({
            name: member.name,
            grossMonthlyIncome: Number(member.grossMonthlyIncome),
            taxPercent: Number(member.taxPercent),
          })) ?? [],
        loans:
          budget?.loans.map((loan) => ({
            bankName: loan.bankName,
            loanName: loan.loanName,
            loanType: loan.loanType,
            monthlyInterest: Number(loan.monthlyInterest),
            monthlyPrincipal: Number(loan.monthlyPrincipal),
            monthlyFees: Number(loan.monthlyFees),
          })) ?? [],
        trips:
          budget?.trips.map((trip) => ({
            name: trip.name,
            transportType: trip.transportType,
            annualTrips: trip.annualTrips,
            ticketPerTrip:
              trip.ticketPerTrip != null
                ? Number(trip.ticketPerTrip)
                : undefined,
            tollPerTrip:
              trip.tollPerTrip != null ? Number(trip.tollPerTrip) : undefined,
            ferryPerTrip:
              trip.ferryPerTrip != null ? Number(trip.ferryPerTrip) : undefined,
            fuelPerTrip:
              trip.fuelPerTrip != null ? Number(trip.fuelPerTrip) : undefined,
          })) ?? [],
        entries:
          budget?.entries.map((entry) => ({
            name: entry.name,
            category: entry.category ?? undefined,
            type: entry.type,
            monthlyAmount: Number(entry.monthlyAmount),
          })) ?? [],
      }}
    />
  )
}
