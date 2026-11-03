import {
  BudgetEntryType,
  BudgetLoanRepaymentType,
  BudgetLoanType,
  ItemStatus,
  Lifecycle,
  Phase,
  PlantType,
  Priority,
  SunNeed,
  TaskStatus,
  TripTransportType,
  WateringMethod,
  WateringNeed,
} from "@workspace/db"
import { describe, expect, it } from "vitest"

import {
  BUDGET_ENTRY_TYPES,
  BUDGET_LOAN_REPAYMENT_TYPES,
  BUDGET_LOAN_TYPES,
  ITEM_STATUSES,
  LIFECYCLES,
  PHASES,
  PLANT_TYPES,
  PRIORITIES,
  SUN_NEEDS,
  TASK_STATUSES,
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
    ["Phase", PHASES, Phase],
    ["TaskStatus", TASK_STATUSES, TaskStatus],
    ["WateringNeed", WATERING_NEEDS, WateringNeed],
    ["WateringMethod", WATERING_METHODS, WateringMethod],
    ["SunNeed", SUN_NEEDS, SunNeed],
    ["PlantType", PLANT_TYPES, PlantType],
    ["Lifecycle", LIFECYCLES, Lifecycle],
    ["BudgetEntryType", BUDGET_ENTRY_TYPES, BudgetEntryType],
    ["BudgetLoanType", BUDGET_LOAN_TYPES, BudgetLoanType],
    [
      "BudgetLoanRepaymentType",
      BUDGET_LOAN_REPAYMENT_TYPES,
      BudgetLoanRepaymentType,
    ],
    ["TripTransportType", TRIP_TRANSPORT_TYPES, TripTransportType],
  ])("%s", (_name, listed, prismaEnum) => {
    expect([...listed].sort()).toEqual(Object.values(prismaEnum).sort())
  })
})
