import {
  db,
  type PackingDuration,
  type PackingSeason,
  type Prisma,
} from "@workspace/db"

import type { ApplicationContext } from "../context"

export const packingItemOrder = [
  { sortOrder: "asc" as const },
  { createdAt: "asc" as const },
  { id: "asc" as const },
]

export const packingListDetailInclude = {
  items: {
    orderBy: packingItemOrder,
    include: { bundle: { select: { id: true, name: true } } },
  },
} satisfies Prisma.PackingListInclude

export type PackingListDetail = Prisma.PackingListGetPayload<{
  include: typeof packingListDetailInclude
}>

export const packingBundleInclude = {
  items: { orderBy: packingItemOrder },
} satisfies Prisma.PackingBundleInclude

export type PackingBundleWithItems = Prisma.PackingBundleGetPayload<{
  include: typeof packingBundleInclude
}>

/** Counts for the overview cards: how much is packed. */
const listSummarySelect = {
  id: true,
  name: true,
  season: true,
  duration: true,
  abroad: true,
  departureOn: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      packed: true,
      bundleId: true,
      bundle: { select: { id: true, name: true } },
    },
    orderBy: packingItemOrder,
  },
} satisfies Prisma.PackingListSelect

export type PackingListSummary = Prisma.PackingListGetPayload<{
  select: typeof listSummarySelect
}>

export type PackingListFilter = {
  /** Substring of the name or notes. */
  query?: string
  season?: PackingSeason
  duration?: PackingDuration
  abroad?: boolean
}

function listWhere(
  context: ApplicationContext,
  filter: PackingListFilter
): Prisma.PackingListWhereInput {
  const contains = filter.query
    ? ({ contains: filter.query, mode: "insensitive" } as const)
    : undefined
  return {
    householdId: context.householdId,
    ...(filter.season ? { season: filter.season } : {}),
    ...(filter.duration ? { duration: filter.duration } : {}),
    ...(filter.abroad !== undefined ? { abroad: filter.abroad } : {}),
    ...(contains ? { OR: [{ name: contains }, { notes: contains }] } : {}),
  }
}

/** Upcoming trips first, then the rest by when they were last changed. */
const listOrder = [
  { departureOn: { sort: "asc", nulls: "last" } },
  { updatedAt: "desc" },
  { id: "asc" },
] satisfies Prisma.PackingListOrderByWithRelationInput[]

export async function listPackingLists(
  context: ApplicationContext,
  filter: PackingListFilter = {}
): Promise<PackingListSummary[]> {
  return db.packingList.findMany({
    where: listWhere(context, filter),
    select: listSummarySelect,
    orderBy: listOrder,
  })
}

export async function listPackingListsPage(
  context: ApplicationContext,
  options: PackingListFilter & { limit: number; offset: number }
) {
  const where = listWhere(context, options)
  const [totalCount, lists] = await Promise.all([
    db.packingList.count({ where }),
    db.packingList.findMany({
      where,
      select: listSummarySelect,
      orderBy: listOrder,
      skip: options.offset,
      take: options.limit,
    }),
  ])
  return { totalCount, lists }
}

export async function getPackingList(
  context: ApplicationContext,
  listId: string
): Promise<PackingListDetail | null> {
  return db.packingList.findFirst({
    where: { id: listId, householdId: context.householdId },
    include: packingListDetailInclude,
  })
}

// ─── Bundles ────────────────────────────────────────────────────

export type PackingBundleFilter = {
  query?: string
  /** Bundles that apply in this season: limited to it, or to no season. */
  season?: PackingSeason
  duration?: PackingDuration
  abroadOnly?: boolean
  autoAdd?: boolean
}

function bundleWhere(
  context: ApplicationContext,
  filter: PackingBundleFilter
): Prisma.PackingBundleWhereInput {
  const and: Prisma.PackingBundleWhereInput[] = []
  if (filter.query) {
    const contains = { contains: filter.query, mode: "insensitive" } as const
    and.push({
      OR: [
        { name: contains },
        { description: contains },
        { items: { some: { name: contains } } },
      ],
    })
  }
  if (filter.season) {
    and.push({
      OR: [{ seasons: { isEmpty: true } }, { seasons: { has: filter.season } }],
    })
  }
  if (filter.duration) {
    and.push({
      OR: [
        { durations: { isEmpty: true } },
        { durations: { has: filter.duration } },
      ],
    })
  }

  return {
    householdId: context.householdId,
    ...(filter.abroadOnly !== undefined
      ? { abroadOnly: filter.abroadOnly }
      : {}),
    ...(filter.autoAdd !== undefined ? { autoAdd: filter.autoAdd } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  }
}

export async function listPackingBundles(
  context: ApplicationContext,
  filter: PackingBundleFilter = {}
): Promise<PackingBundleWithItems[]> {
  return db.packingBundle.findMany({
    where: bundleWhere(context, filter),
    include: packingBundleInclude,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  })
}

export async function listPackingBundlesPage(
  context: ApplicationContext,
  options: PackingBundleFilter & { limit: number; offset: number }
) {
  const where = bundleWhere(context, options)
  const [totalCount, bundles] = await Promise.all([
    db.packingBundle.count({ where }),
    db.packingBundle.findMany({
      where,
      include: packingBundleInclude,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: options.offset,
      take: options.limit,
    }),
  ])
  return { totalCount, bundles }
}

export async function getPackingBundle(
  context: ApplicationContext,
  bundleId: string
): Promise<PackingBundleWithItems | null> {
  return db.packingBundle.findFirst({
    where: { id: bundleId, householdId: context.householdId },
    include: packingBundleInclude,
  })
}
