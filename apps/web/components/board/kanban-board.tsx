"use client"

import {
  createContext,
  useContext,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { ChevronDown, ChevronRight, Lock } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@workspace/ui/lib/utils"

import type { BoardColumnDef } from "@/lib/board/types"

/**
 * A Planner-style board: one column per value of the field the board is
 * grouped on, and dragging a card to another column changes that field. The
 * board knows nothing about shopping or projects; the caller maps an item to a
 * column (`getColumnKey`), says how it looks once moved (`applyMove`, shown
 * at once) and saves the move (`onMove`). A failed save puts the card back.
 */

export interface KanbanBoardProps<T> {
  items: T[]
  columns: BoardColumnDef[]
  getId: (item: T) => string
  getLabel: (item: T) => string
  getColumnKey: (item: T) => string
  /** Done cards sink to a collapsed "Fullført" section in their column. */
  isDone?: (item: T) => boolean
  doneLabel?: string
  compare: (a: T, b: T) => number
  renderCard: (item: T) => ReactNode
  renderColumnSummary?: (items: T[]) => ReactNode
  /** `null` when a drop in that column changes nothing. */
  applyMove: (item: T, columnKey: string) => T | null
  onMove: (item: T, columnKey: string) => Promise<unknown>
  /** Click or Enter on a card. */
  onOpen: (item: T) => void
  emptyLabel?: string
}

type DragGuard = { current: boolean }

const DragGuardContext = createContext<DragGuard>({ current: false })

const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args)
  return pointer.length > 0 ? pointer : rectIntersection(args)
}

export function KanbanBoard<T>({
  items,
  columns,
  getId,
  getLabel,
  getColumnKey,
  isDone,
  doneLabel = "Fullført",
  compare,
  renderCard,
  renderColumnSummary,
  applyMove,
  onMove,
  onOpen,
  emptyLabel = "Ingen kort",
}: KanbanBoardProps<T>) {
  const dndId = useId()
  const [, startTransition] = useTransition()
  const [optimisticItems, setOptimisticItem] = useOptimistic(
    items,
    (state: T[], next: T) =>
      state.map((item) => (getId(item) === getId(next) ? next : item))
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  // A drag ends with a pointerup over the card; the click that can follow
  // must not open the card.
  const justDragged = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter"],
      },
    })
  )

  const columnLabels = useMemo(
    () => new Map(columns.map((column) => [column.key, column.label])),
    [columns]
  )

  const byColumn = useMemo(() => {
    const grouped = new Map<string, T[]>(
      columns.map((column) => [column.key, []])
    )
    for (const item of optimisticItems) {
      grouped.get(getColumnKey(item))?.push(item)
    }
    for (const list of grouped.values()) list.sort(compare)
    return grouped
  }, [columns, optimisticItems, getColumnKey, compare])

  const itemById = useMemo(
    () => new Map(optimisticItems.map((item) => [getId(item), item])),
    [optimisticItems, getId]
  )
  const activeItem = activeId ? itemById.get(activeId) : undefined

  function finishDrag() {
    setActiveId(null)
    justDragged.current = true
    setTimeout(() => {
      justDragged.current = false
    }, 0)
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    finishDrag()
    const item = itemById.get(String(event.active.id))
    const target = event.over ? String(event.over.id) : null
    if (!item || !target || target === getColumnKey(item)) return

    const column = columns.find((c) => c.key === target)
    if (!column?.droppable) return

    const moved = applyMove(item, target)
    if (!moved) return

    startTransition(async () => {
      setOptimisticItem(moved)
      try {
        await onMove(item, target)
      } catch {
        toast.error(`Kunne ikke flytte «${getLabel(item)}». Prøv igjen.`)
      }
    })
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Plukket opp ${labelOf(active.id)}. Bruk piltastene for å flytte, mellomrom for å slippe og Escape for å avbryte.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} er over kolonnen ${columnLabels.get(String(over.id)) ?? ""}.`
        : `${labelOf(active.id)} er ikke over en kolonne.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} ble flyttet til ${columnLabels.get(String(over.id)) ?? ""}.`
        : `${labelOf(active.id)} ble sluppet uten å flyttes.`,
    onDragCancel: ({ active }) =>
      `Flyttingen av ${labelOf(active.id)} ble avbrutt.`,
  }

  function labelOf(id: string | number) {
    const item = itemById.get(String(id))
    return item ? `«${getLabel(item)}»` : "kortet"
  }

  return (
    <DragGuardContext.Provider value={justDragged}>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={finishDrag}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "Trykk mellomrom for å plukke opp kortet. Flytt med piltastene, og trykk mellomrom igjen for å slippe det i en annen kolonne. Enter åpner kortet.",
          },
        }}
      >
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
          {columns.map((column) => (
            <BoardColumn
              key={column.key}
              column={column}
              items={byColumn.get(column.key) ?? []}
              isDragging={activeId !== null}
              isDone={isDone}
              doneLabel={doneLabel}
              getId={getId}
              getLabel={getLabel}
              onOpen={onOpen}
              renderCard={renderCard}
              renderColumnSummary={renderColumnSummary}
              emptyLabel={emptyLabel}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <div className="rotate-2 cursor-grabbing shadow-lg">
              {renderCard(activeItem)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </DragGuardContext.Provider>
  )
}

function BoardColumn<T>({
  column,
  items,
  isDragging,
  isDone,
  doneLabel,
  getId,
  getLabel,
  onOpen,
  renderCard,
  renderColumnSummary,
  emptyLabel,
}: {
  column: BoardColumnDef
  items: T[]
  isDragging: boolean
  isDone?: (item: T) => boolean
  doneLabel: string
  getId: (item: T) => string
  getLabel: (item: T) => string
  onOpen: (item: T) => void
  renderCard: (item: T) => ReactNode
  renderColumnSummary?: (items: T[]) => ReactNode
  emptyLabel: string
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.key,
    disabled: !column.droppable,
  })
  const [open, setOpen] = useState(!column.collapsedByDefault)
  const [doneOpen, setDoneOpen] = useState(false)

  const active = isDone ? items.filter((item) => !isDone(item)) : items
  const done = isDone ? items.filter(isDone) : []

  const card = (item: T) => (
    <DraggableCard
      key={getId(item)}
      id={getId(item)}
      label={getLabel(item)}
      onOpen={() => onOpen(item)}
    >
      {renderCard(item)}
    </DraggableCard>
  )

  return (
    <section
      ref={setNodeRef}
      aria-label={column.label}
      title={column.hint}
      className={cn(
        "flex max-h-[calc(100svh-12rem)] min-h-40 w-68 shrink-0 flex-col rounded-xl bg-muted/50 ring-1 ring-foreground/5 transition-colors",
        isOver && "bg-primary/10 ring-2 ring-primary/40",
        isDragging && !column.droppable && "opacity-50"
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        {column.accentClassName && (
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              column.accentClassName
            )}
            aria-hidden
          />
        )}
        {column.isPrivate && (
          <Lock
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-label="Privat liste"
          />
        )}
        <h3 className="min-w-0 truncate text-sm font-medium">{column.label}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {items.length}
        </span>
        {renderColumnSummary && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {renderColumnSummary(items)}
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {column.collapsedByDefault && items.length > 0 && (
          <SectionToggle open={open} onToggle={() => setOpen(!open)}>
            {open ? "Skjul" : "Vis"} {items.length}
          </SectionToggle>
        )}

        {open && (
          <>
            {active.map(card)}

            {done.length > 0 && (
              <>
                <SectionToggle
                  open={doneOpen}
                  onToggle={() => setDoneOpen(!doneOpen)}
                >
                  {doneLabel} {done.length}
                </SectionToggle>
                {doneOpen && done.map(card)}
              </>
            )}
          </>
        )}

        {items.length === 0 && (
          <p
            className={cn(
              "rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground",
              isOver && "border-primary/50"
            )}
          >
            {isDragging && !column.droppable && column.hint
              ? column.hint
              : emptyLabel}
          </p>
        )}
      </div>
    </section>
  )
}

function SectionToggle({
  open,
  onToggle,
  children,
}: {
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const Icon = open ? ChevronDown : ChevronRight
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}

function DraggableCard({
  id,
  label,
  onOpen,
  children,
}: {
  id: string
  label: string
  onOpen: () => void
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    attributes: { roleDescription: "flyttbart kort" },
  })
  const justDragged = useContext(DragGuardContext)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      onClick={() => {
        // A drag ends with a pointerup over the card; that is not a click.
        if (!justDragged.current) onOpen()
      }}
      onKeyDown={(event) => {
        // Space picks the card up (dnd-kit); Enter opens it. Keys from nested
        // controls such as a checkbox or a link are theirs.
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter") {
          event.preventDefault()
          onOpen()
          return
        }
        listeners?.onKeyDown?.(event)
      }}
      className={cn(
        "cursor-grab touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "opacity-40"
      )}
    >
      {children}
    </div>
  )
}
