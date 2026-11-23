import Link from "next/link"
import { cn } from "@workspace/ui/lib/utils"

export type ChipOption = {
  /** The search param value, or undefined for "Alle". */
  value: string | undefined
  label: string
}

/**
 * One row of filter chips bound to a search param. Every chip keeps the other
 * params, so filters combine.
 */
export function FilterChipRow({
  label,
  param,
  options,
  current,
  basePath,
  params,
}: {
  label: string
  param: string
  options: ChipOption[]
  current: string | undefined
  basePath: string
  params: Record<string, string | undefined>
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-6.5 w-16 shrink-0 items-center text-xs text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {options.map((option) => (
          <FilterChip
            key={option.value ?? "alle"}
            href={hrefWith(basePath, params, param, option.value)}
            active={current === option.value}
          >
            {option.label}
          </FilterChip>
        ))}
      </div>
    </div>
  )
}

function hrefWith(
  basePath: string,
  params: Record<string, string | undefined>,
  param: string,
  value: string | undefined
) {
  const search = new URLSearchParams()
  for (const [key, existing] of Object.entries({ ...params, [param]: value })) {
    if (existing) search.set(key, existing)
  }
  const query = search.toString()
  return query ? `${basePath}?${query}` : basePath
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </Link>
  )
}
