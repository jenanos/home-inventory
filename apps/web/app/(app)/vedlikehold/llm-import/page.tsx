import { requireHousehold } from "@/lib/session"
import { getMaintenanceTasks } from "@/lib/queries/maintenance"
import { MaintenanceLlmImportPageClient } from "../llm-import-page-client"

export default async function VedlikeholdLlmImportPage() {
  const { membership } = await requireHousehold()
  const tasks = await getMaintenanceTasks(membership.householdId)

  return (
    <MaintenanceLlmImportPageClient
      householdName={membership.household.name}
      existingTasks={tasks.map((task) => ({
        title: task.title,
        description: task.description ?? undefined,
        priority: task.priority,
        estimatedDuration: task.estimatedDuration ?? undefined,
        estimatedPrice:
          task.estimatedPrice != null ? Number(task.estimatedPrice) : undefined,
        dueDate: task.dueDate
          ? task.dueDate.toISOString().slice(0, 10)
          : undefined,
        vendors: task.vendors.map((vendor) => ({
          name: vendor.name,
          description: vendor.description ?? undefined,
          phone: vendor.phone ?? undefined,
          email: vendor.email ?? undefined,
          website: vendor.website ?? undefined,
          estimatedPrice:
            vendor.estimatedPrice != null
              ? Number(vendor.estimatedPrice)
              : undefined,
          notes: vendor.notes ?? undefined,
        })),
        progressEntries: task.progressEntries.map((entry) => ({
          title: entry.title,
          description: entry.description ?? undefined,
        })),
      }))}
    />
  )
}
