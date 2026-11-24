import {
  BudgetEntryType,
  BudgetFrequency,
  BudgetLoanRepaymentType,
  BudgetLoanType,
  CalendarEventRecurrence,
  CalendarEventType,
  ItemStatus,
  Lifecycle,
  PackingDuration,
  PackingListKind,
  PackingSeason,
  PlantType,
  Priority,
  SunNeed,
  ProjectExecution,
  ProjectScale,
  ProjectStatus,
  ProjectType,
  TripTransportType,
  WateringMethod,
  WateringNeed,
} from "@workspace/db"
import { describe, expect, it } from "vitest"

import {
  BUDGET_ENTRY_TYPES,
  BUDGET_FREQUENCIES,
  BUDGET_LOAN_REPAYMENT_TYPES,
  BUDGET_LOAN_TYPES,
  EVENT_RECURRENCES,
  EVENT_TYPES,
  ITEM_STATUSES,
  LIFECYCLES,
  PACKING_DURATIONS,
  PACKING_LIST_KINDS,
  PACKING_SEASONS,
  PLANT_TYPES,
  PRIORITIES,
  SUN_NEEDS,
  PROJECT_EXECUTIONS,
  PROJECT_SCALES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  TRIP_TRANSPORT_TYPES,
  WATERING_METHODS,
  WATERING_NEEDS,
} from "./shared"

/**
 * The tool schemas hard-code their enum values so a schema edit cannot silently
 * change a published contract. That only works if someone notices the drift —
 * which is what this test is for. A failure here means a Prisma enum changed
 * and the tool contract, its description and the runbook need a decision, not
 * just a new string in the list.
 */
describe("tool enum contracts cover the Prisma schema", () => {
  it.each([
    ["ItemStatus", ITEM_STATUSES, ItemStatus],
    ["Priority", PRIORITIES, Priority],
    ["ProjectStatus", PROJECT_STATUSES, ProjectStatus],
    ["ProjectType", PROJECT_TYPES, ProjectType],
    ["ProjectScale", PROJECT_SCALES, ProjectScale],
    ["ProjectExecution", PROJECT_EXECUTIONS, ProjectExecution],
    ["WateringNeed", WATERING_NEEDS, WateringNeed],
    ["WateringMethod", WATERING_METHODS, WateringMethod],
    ["SunNeed", SUN_NEEDS, SunNeed],
    ["PlantType", PLANT_TYPES, PlantType],
    ["Lifecycle", LIFECYCLES, Lifecycle],
    ["BudgetEntryType", BUDGET_ENTRY_TYPES, BudgetEntryType],
    ["BudgetFrequency", BUDGET_FREQUENCIES, BudgetFrequency],
    ["BudgetLoanType", BUDGET_LOAN_TYPES, BudgetLoanType],
    [
      "BudgetLoanRepaymentType",
      BUDGET_LOAN_REPAYMENT_TYPES,
      BudgetLoanRepaymentType,
    ],
    ["TripTransportType", TRIP_TRANSPORT_TYPES, TripTransportType],
    ["CalendarEventType", EVENT_TYPES, CalendarEventType],
    ["CalendarEventRecurrence", EVENT_RECURRENCES, CalendarEventRecurrence],
    ["PackingSeason", PACKING_SEASONS, PackingSeason],
    ["PackingDuration", PACKING_DURATIONS, PackingDuration],
    ["PackingListKind", PACKING_LIST_KINDS, PackingListKind],
  ])("%s", (_name, listed, prismaEnum) => {
    expect([...listed].sort()).toEqual(Object.values(prismaEnum).sort())
  })
})
