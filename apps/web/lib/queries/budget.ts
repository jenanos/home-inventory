import type { ApplicationContext } from "@/lib/application/context"
import { getBudget as readBudget } from "@/lib/application/budget/read"

export async function getBudget(context: ApplicationContext) {
  return readBudget(context)
}
