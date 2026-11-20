"use client"

import { useEffect, useState } from "react"

import { osloToday } from "@/lib/board/due-date"

/**
 * Today's date in Norway (`YYYY-MM-DD`) that follows the calendar: a board
 * left open past midnight, or brought back from the background, moves its
 * due-date columns to the new day.
 */
export function useOsloToday() {
  const [today, setToday] = useState(osloToday)

  useEffect(() => {
    const refresh = () => setToday(osloToday())
    const interval = setInterval(refresh, 60_000)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      clearInterval(interval)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])

  return today
}
