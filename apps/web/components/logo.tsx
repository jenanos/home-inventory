import { cn } from "@workspace/ui/lib/utils"

interface LogoProps {
  className?: string
  "aria-label"?: string
  title?: string
}

export function Logo({
  className,
  "aria-label": ariaLabel = "Home Overview",
  title,
}: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ariaLabel}
      className={cn(className)}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient
          id="app-logo-gradient"
          x1="2"
          y1="2"
          x2="22"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="var(--chart-1)" />
          <stop offset="0.25" stopColor="var(--chart-5)" />
          <stop offset="0.5" stopColor="var(--chart-4)" />
          <stop offset="0.75" stopColor="var(--chart-3)" />
          <stop offset="1" stopColor="var(--chart-2)" />
        </linearGradient>
      </defs>
      <g stroke="url(#app-logo-gradient)">
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
        <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </g>
    </svg>
  )
}
