"use server"

import { db, type Priority, type TaskStatus } from "@workspace/db"
import { requireHousehold } from "@/lib/session"
import { revalidatePath } from "next/cache"

// --- MaintenanceTask actions ---

interface CreateMaintenanceTaskInput {
  title: string
  description?: string
  priority?: Priority
  estimatedDuration?: string
  estimatedPrice?: number
  dueDate?: Date
}

export async function createMaintenanceTask(input: CreateMaintenanceTaskInput) {
  const { membership } = await requireHousehold()

  const task = await db.maintenanceTask.create({
    data: {
      title: input.title,
      description: input.description,
      priority: input.priority ?? "MEDIUM",
      estimatedDuration: input.estimatedDuration,
      estimatedPrice: input.estimatedPrice,
      dueDate: input.dueDate,
      householdId: membership.householdId,
    },
  })

  revalidatePath("/vedlikehold")
  return { ...task, estimatedPrice: task.estimatedPrice ? Number(task.estimatedPrice) : null }
}

interface UpdateMaintenanceTaskInput {
  id: string
  title?: string
  description?: string | null
  priority?: Priority
  status?: TaskStatus
  estimatedDuration?: string | null
  estimatedPrice?: number | null
  dueDate?: Date | null
}

export async function updateMaintenanceTask(input: UpdateMaintenanceTaskInput) {
  const { membership } = await requireHousehold()

  const task = await db.maintenanceTask.findUnique({
    where: { id: input.id },
  })
  if (!task || task.householdId !== membership.householdId) {
    throw new Error("Task not found")
  }

  const { id, ...data } = input
  const updated = await db.maintenanceTask.update({
    where: { id },
    data,
  })

  revalidatePath("/vedlikehold")
  return { ...updated, estimatedPrice: updated.estimatedPrice ? Number(updated.estimatedPrice) : null }
}

export async function deleteMaintenanceTask(taskId: string) {
  const { membership } = await requireHousehold()

  const task = await db.maintenanceTask.findUnique({
    where: { id: taskId },
  })
  if (!task || task.householdId !== membership.householdId) {
    throw new Error("Task not found")
  }

  await db.maintenanceTask.delete({ where: { id: taskId } })

  revalidatePath("/vedlikehold")
}

// --- TaskVendor actions ---

interface CreateTaskVendorInput {
  taskId: string
  name: string
  description?: string
  phone?: string
  email?: string
  website?: string
  estimatedPrice?: number
  notes?: string
}

export async function createTaskVendor(input: CreateTaskVendorInput) {
  const { membership } = await requireHousehold()

  const task = await db.maintenanceTask.findUnique({
    where: { id: input.taskId },
  })
  if (!task || task.householdId !== membership.householdId) {
    throw new Error("Task not found")
  }

  const vendor = await db.taskVendor.create({
    data: {
      name: input.name,
      description: input.description,
      phone: input.phone,
      email: input.email,
      website: input.website,
      estimatedPrice: input.estimatedPrice,
      notes: input.notes,
      taskId: input.taskId,
    },
  })

  revalidatePath(`/vedlikehold/${input.taskId}`)
  return { ...vendor, estimatedPrice: vendor.estimatedPrice ? Number(vendor.estimatedPrice) : null }
}

interface UpdateTaskVendorInput {
  id: string
  name?: string
  description?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  estimatedPrice?: number | null
  notes?: string | null
  isSelected?: boolean
}

export async function updateTaskVendor(input: UpdateTaskVendorInput) {
  const { membership } = await requireHousehold()

  const vendor = await db.taskVendor.findUnique({
    where: { id: input.id },
    include: { task: true },
  })
  if (!vendor || vendor.task.householdId !== membership.householdId) {
    throw new Error("Vendor not found")
  }

  const { id, ...data } = input
  const updated = await db.taskVendor.update({
    where: { id },
    data,
  })

  revalidatePath(`/vedlikehold/${vendor.taskId}`)
  return { ...updated, estimatedPrice: updated.estimatedPrice ? Number(updated.estimatedPrice) : null }
}

export async function deleteTaskVendor(vendorId: string) {
  const { membership } = await requireHousehold()

  const vendor = await db.taskVendor.findUnique({
    where: { id: vendorId },
    include: { task: true },
  })
  if (!vendor || vendor.task.householdId !== membership.householdId) {
    throw new Error("Vendor not found")
  }

  await db.taskVendor.delete({ where: { id: vendorId } })

  revalidatePath(`/vedlikehold/${vendor.taskId}`)
}

export async function selectTaskVendor(vendorId: string) {
  const { membership } = await requireHousehold()

  const vendor = await db.taskVendor.findUnique({
    where: { id: vendorId },
    include: { task: true },
  })
  if (!vendor || vendor.task.householdId !== membership.householdId) {
    throw new Error("Vendor not found")
  }

  await db.$transaction([
    db.taskVendor.updateMany({
      where: { taskId: vendor.taskId },
      data: { isSelected: false },
    }),
    db.taskVendor.update({
      where: { id: vendorId },
      data: { isSelected: true },
    }),
  ])

  revalidatePath(`/vedlikehold/${vendor.taskId}`)
}

// --- TaskProgressEntry actions ---

interface CreateProgressEntryInput {
  taskId: string
  title: string
  description?: string
  dueDate?: Date
  sortOrder?: number
}

export async function createProgressEntry(input: CreateProgressEntryInput) {
  const { membership } = await requireHousehold()

  const task = await db.maintenanceTask.findUnique({
    where: { id: input.taskId },
  })
  if (!task || task.householdId !== membership.householdId) {
    throw new Error("Task not found")
  }

  const entry = await db.taskProgressEntry.create({
    data: {
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      sortOrder: input.sortOrder ?? 0,
      taskId: input.taskId,
    },
  })

  revalidatePath(`/vedlikehold/${input.taskId}`)
  return entry
}

interface UpdateProgressEntryInput {
  id: string
  title?: string
  description?: string | null
  dueDate?: Date | null
  completed?: boolean
  sortOrder?: number
}

export async function updateProgressEntry(input: UpdateProgressEntryInput) {
  const { membership } = await requireHousehold()

  const entry = await db.taskProgressEntry.findUnique({
    where: { id: input.id },
    include: { task: true },
  })
  if (!entry || entry.task.householdId !== membership.householdId) {
    throw new Error("Progress entry not found")
  }

  const { id, completed, ...rest } = input
  const updated = await db.taskProgressEntry.update({
    where: { id },
    data: {
      ...rest,
      ...(completed !== undefined && {
        completed,
        completedAt: completed ? new Date() : null,
      }),
    },
  })

  revalidatePath(`/vedlikehold/${entry.taskId}`)
  return updated
}

export async function deleteProgressEntry(entryId: string) {
  const { membership } = await requireHousehold()

  const entry = await db.taskProgressEntry.findUnique({
    where: { id: entryId },
    include: { task: true },
  })
  if (!entry || entry.task.householdId !== membership.householdId) {
    throw new Error("Progress entry not found")
  }

  await db.taskProgressEntry.delete({ where: { id: entryId } })

  revalidatePath(`/vedlikehold/${entry.taskId}`)
}
