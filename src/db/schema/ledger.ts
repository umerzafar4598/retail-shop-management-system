import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { ledgerAccountTypeEnum, normalBalanceEnum } from "./enums";
import { createdAt, money, timestampNow, updatedAt } from "./helpers";
import { shops } from "./shops";

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    accountType: ledgerAccountTypeEnum("account_type").notNull(),
    normalBalance: normalBalanceEnum("normal_balance").notNull(),
    systemKey: text("system_key"),
    isSystem: boolean("is_system").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("ledger_accounts_shop_code_unique").on(table.shopId, table.code),
    uniqueIndex("ledger_accounts_shop_name_unique").on(table.shopId, table.name),
    uniqueIndex("ledger_accounts_shop_system_key_unique").on(table.shopId, table.systemKey),
    uniqueIndex("ledger_accounts_shop_id_unique").on(table.shopId, table.id),
    index("ledger_accounts_parent_idx").on(table.parentId),
    foreignKey({
      columns: [table.shopId, table.parentId],
      foreignColumns: [table.shopId, table.id],
      name: "ledger_accounts_shop_parent_fk",
    }).onDelete("restrict"),
  ],
);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    referenceType: text("reference_type").notNull(),
    referenceId: uuid("reference_id"),
    description: text("description").notNull(),
    occurredAt: timestampNow("occurred_at"),
    createdAt: createdAt(),
    createdBy: text("created_by").notNull(),
    reversalOfId: uuid("reversal_of_id"),
  },
  (table) => [
    uniqueIndex("ledger_transactions_shop_id_unique").on(table.shopId, table.id),
    index("ledger_transactions_shop_occurred_idx").on(table.shopId, table.occurredAt),
    index("ledger_transactions_reference_idx").on(table.referenceType, table.referenceId),
    index("ledger_transactions_reversal_idx").on(table.reversalOfId),
    foreignKey({
      columns: [table.shopId, table.reversalOfId],
      foreignColumns: [table.shopId, table.id],
      name: "ledger_transactions_shop_reversal_fk",
    }).onDelete("restrict"),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    ledgerTransactionId: uuid("ledger_transaction_id").notNull(),
    ledgerAccountId: uuid("ledger_account_id").notNull(),
    // The database FK to cash_sessions is added in the custom finance migration
    // because cash.ts depends on financialAccounts, which in turn depends on ledger.ts.
    cashSessionId: uuid("cash_session_id"),
    debit: money("debit").notNull().default("0.00"),
    credit: money("credit").notNull().default("0.00"),
    description: text("description"),
    createdAt: createdAt(),
  },
  (table) => [
    index("ledger_entries_shop_transaction_idx").on(table.shopId, table.ledgerTransactionId),
    index("ledger_entries_shop_account_idx").on(table.shopId, table.ledgerAccountId),
    index("ledger_entries_cash_session_idx").on(table.cashSessionId),
    check("ledger_entries_debit_non_negative", sql`${table.debit} >= 0`),
    check("ledger_entries_credit_non_negative", sql`${table.credit} >= 0`),
    check(
      "ledger_entries_exactly_one_side",
      sql`(${table.debit} > 0 AND ${table.credit} = 0) OR (${table.debit} = 0 AND ${table.credit} > 0)`,
    ),
    foreignKey({
      columns: [table.shopId, table.ledgerTransactionId],
      foreignColumns: [ledgerTransactions.shopId, ledgerTransactions.id],
      name: "ledger_entries_shop_transaction_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.ledgerAccountId],
      foreignColumns: [ledgerAccounts.shopId, ledgerAccounts.id],
      name: "ledger_entries_shop_account_fk",
    }).onDelete("restrict"),
  ],
);
