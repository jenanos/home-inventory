import { isApplicationError } from "@/lib/application/errors"

/**
 * What a server action returns when the page should show the service's own
 * message on failure. Next.js hides the message of a thrown error in
 * production, so expected failures (a duplicate name, a stale write) are
 * returned instead; anything else is still thrown.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export async function toActionResult<T>(
  run: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() }
  } catch (error) {
    if (isApplicationError(error)) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}
