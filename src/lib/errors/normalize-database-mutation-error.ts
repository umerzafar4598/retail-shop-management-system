import "server-only";

type ErrorNode = {
    cause?: unknown;
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
    query?: unknown;
};

type PostgresDiagnostics = {
    code?: string;
    constraint?: string;
    isDrizzleQueryError: boolean;
};

function inspectDatabaseError(error: unknown): PostgresDiagnostics {
    const visited = new Set<object>();
    let current: unknown = error;
    let code: string | undefined;
    let constraint: string | undefined;
    let isDrizzleQueryError = false;

    for (let depth = 0; depth < 8 && current && typeof current === "object"; depth += 1) {
        if (visited.has(current)) break;
        visited.add(current);

        const node = current as ErrorNode;
        if (typeof node.code === "string" && !code) code = node.code;
        if (typeof node.constraint === "string" && !constraint) constraint = node.constraint;
        if (typeof node.query === "string") isDrizzleQueryError = true;
        if (typeof node.message === "string" && node.message.startsWith("Failed query:")) {
            isDrizzleQueryError = true;
        }
        current = node.cause;
    }

    return { code, constraint, isDrizzleQueryError };
}

export function normalizeDatabaseMutationError(
    error: unknown,
    options: {
        operation: string;
        fallbackMessage: string;
        duplicateConstraint: string;
        duplicateMessage: string;
    },
): Error {
    const diagnostics = inspectDatabaseError(error);

    if (diagnostics.code === "23505" && diagnostics.constraint === options.duplicateConstraint) {
        return new Error(options.duplicateMessage);
    }

    if (diagnostics.code || diagnostics.isDrizzleQueryError) {
        // Do not log the raw Drizzle/Postgres exception: it may contain SQL and bound values.
        console.error(`${options.operation} failed.`, {
            databaseCode: diagnostics.code ?? "UNKNOWN",
            constraint: diagnostics.constraint ?? null,
        });
        return new Error(options.fallbackMessage);
    }

    // Preserve deliberate domain/validation errors raised by application code.
    return error instanceof Error ? error : new Error(options.fallbackMessage);
}
