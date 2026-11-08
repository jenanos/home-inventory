import type { ApplicationContext } from "@/lib/application/context"
import {
  getProject as readProject,
  listProjectOptions,
  listProjects,
  listUnlinkedShoppingLists,
} from "@/lib/application/projects/read"

export async function getProjects(context: ApplicationContext) {
  return listProjects(context)
}

export async function getProject(
  context: ApplicationContext,
  projectId: string
) {
  return readProject(context, projectId)
}

export async function getProjectOptions(context: ApplicationContext) {
  return listProjectOptions(context)
}

export async function getUnlinkedShoppingLists(context: ApplicationContext) {
  return listUnlinkedShoppingLists(context)
}
