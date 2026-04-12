import { requireHousehold } from "@/lib/session"
import { ensureBudget } from "@/lib/actions/budget"
import { BudgetLlmImportPageClient } from "../llm-import-page-client"

export default async function BudgetLlmImportPage() {
  await requireHousehold()
  await ensureBudget()
  return <BudgetLlmImportPageClient />
}
