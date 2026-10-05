# Schema Notes

## Money

PostgreSQL `NUMERIC(14,2)` is used for monetary fields. Drizzle returns numeric values as strings by default, preserving exact decimal values. Business calculations should use `decimal.js` rather than binary floating point.

## Financial account vs ledger account

A `financial_account` is the actual money location (Cash Drawer, Easypaisa 676, JazzCash 733, HBL account, etc.). A `ledger_account` is the accounting account. Each financial account maps 1:1 to a ledger account.

## Balance

No authoritative mutable balance column is stored on financial accounts. Balances are derived from posted ledger entries. Cached balances may be introduced later as an optimization without replacing the ledger as the source of truth.

## Inventory

`inventory_balances` is the current operational state. `inventory_movements` is the historical source explaining why stock changed.

## Services

`provider_account_id` identifies the exact shop wallet/bank account used for the external provider operation. `service_payments.financial_account_id` identifies where the customer payment was received or from where a payment was made.

## Better Auth

Better Auth's auth tables are integrated during Phase 4 so the authentication configuration and generated schema remain synchronized with the actual auth setup.
