export const APPLICATION_ERROR_CODES = [
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "FORBIDDEN",
  "SCOPE_REQUIRED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const

export type ApplicationErrorCode = (typeof APPLICATION_ERROR_CODES)[number]

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode

  constructor(
    code: ApplicationErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = "ApplicationError"
    this.code = code
  }
}

export class ApplicationUserNotFoundError extends ApplicationError {
  constructor() {
    super("FORBIDDEN", "Brukeren har ikke tilgang til applikasjonen.")
    this.name = "ApplicationUserNotFoundError"
  }
}

export class HouseholdMembershipRequiredError extends ApplicationError {
  constructor() {
    super("FORBIDDEN", "Brukeren er ikke medlem av en husstand.")
    this.name = "HouseholdMembershipRequiredError"
  }
}

export class AmbiguousHouseholdMembershipError extends ApplicationError {
  constructor() {
    super(
      "FORBIDDEN",
      "Brukerens husstandsmedlemskap kan ikke avgjøres entydig."
    )
    this.name = "AmbiguousHouseholdMembershipError"
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError
}
