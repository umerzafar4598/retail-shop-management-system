# Fixed `src/db/schema`

Replace the project's `src/db/schema/` contents with the TypeScript files in this folder.

Changed files:
- access.ts
- accounts.ts
- cash.ts
- catalog.ts
- expenses.ts
- helpers.ts
- inventory.ts
- ledger.ts
- procurement.ts
- returns.ts
- sales.ts
- services.ts

Unchanged but included for completeness:
- audit.ts
- document-sequences.ts
- enums.ts
- index.ts
- shops.ts

Important:
- PostgreSQL money columns now use explicit snake_case database names while keeping camelCase TypeScript property names.
- Shop-owned relationships use composite foreign keys so a row from Shop A cannot point at Shop B's product/account/etc.
- Child tables that need to participate in those composite relationships now carry shop_id.
- ledger_entries.cash_session_id remains nullable and indexed; its database FK should be added in the custom finance migration after the generated initial migration because the current schema-module dependency would otherwise introduce a circular import.
- Better Auth user foreign keys remain intentionally deferred to Phase 4.
