# Phase 3 Database Foundation

Copy the `src/db` and `drizzle.config.ts` files into the project root, then run:

```bash
npm run typecheck
npm run lint
npm run build
npm run db:check
npm run db:generate
```

Review the generated migration before applying it.

## Important

Better Auth's user/session/account/verification schema is intentionally integrated in Phase 4, after the app's database foundation is stable. The current `shop_memberships.user_id` and `audit_logs.actor_user_id` fields are text and will receive the appropriate Better Auth foreign-key relationship during that integration.

## Ledger balance trigger

After generating the first migration, add the deferred balance-check trigger from `ledger-balance-trigger.sql` before applying the migration.

## Suggested package scripts

Add these to `package.json`:

```json
"db:check": "tsx src/db/smoke-test.ts",
"db:seed": "tsx src/db/seed.ts"
```

After migration, run `npm run db:seed`.
