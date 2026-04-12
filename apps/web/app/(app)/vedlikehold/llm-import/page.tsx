import { requireHousehold } from "@/lib/session"
import { MaintenanceLlmImportPageClient } from "../llm-import-page-client"

export default async function VedlikeholdLlmImportPage() {
  const { membership } = await requireHousehold()

  return <MaintenanceLlmImportPageClient householdName={membership.household.name} />
}
