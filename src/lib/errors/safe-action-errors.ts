import "server-only";

/**
 * Return a user-safe message for unexpected failures in a server action.
 * Deliberately do not log the error message, stack, SQL query, or parameters:
 * database errors can contain customer or financial data.
 */
export function safeActionErrorMessage(error: unknown, operation: string): string {
  logUnexpectedActionError(operation, error);
  return "The request could not be completed. Please try again. If the problem continues, contact the shop owner.";
}

/** Log only error metadata that is safe to retain in ordinary application logs. */
export function logUnexpectedActionError(operation: string, error: unknown): void {
  const errorName = error instanceof Error ? error.name : "NonErrorThrown";
  const errorType = error === null ? "null" : typeof error;

  console.error("[server-action] Unexpected failure", {
    operation,
    errorName,
    errorType,
  });
}
