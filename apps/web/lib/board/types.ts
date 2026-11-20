/** One column on a board. `key` is what a card's grouping value maps to. */
export interface BoardColumnDef {
  key: string
  label: string
  /** False for columns that cannot be dropped in, like "Forfalt". */
  droppable: boolean
  /** Shown as a tooltip and to screen readers when the column takes no drops. */
  hint?: string
  /** Optional Tailwind classes for the column's colour marker. */
  accentClassName?: string
  /** Cards are hidden behind a "Vis" toggle until the column is opened. */
  collapsedByDefault?: boolean
  /** Lock icon for a private list. */
  isPrivate?: boolean
}

export interface BoardGroupingOption<Id extends string = string> {
  id: Id
  label: string
}
