import "server-only";

/**
 * Drizzle may wrap the PostgreSQL error in a DrizzleQueryError. Walk the
 * supported cause chain so expected constraint conflicts can be handled
 * without returning raw database errors to the browser.
 */
export function isPostgresConstraintViolation(
    error: unknown,
    expectedCode: string,
    expectedConstraint: string,
): boolean {
    const queue: unknown[] = [error];
    const visited = new Set<object>();

    while (queue.length > 0) {
        const current = queue.shift();
        if (typeof current !== "object" || current === null) continue;
        if (visited.has(current)) continue;
        visited.add(current);

        const value = current as Record<string, unknown>;
        if (value.code === expectedCode && value.constraint === expectedConstraint) {
            return true;
        }

        for (const key of ["cause", "originalError", "driverError", "parent"]) {
            const nested = value[key];
            if (nested && typeof nested === "object") queue.push(nested);
        }
    }

    return false;
}
