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

import { financialAccountKindEnum } from "./enums";
import { createdAt, money, timestampNow, updatedAt } from "./helpers";
import { ledgerAccounts } from "./ledger";
import { shops } from "./shops";

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    ledgerAccountId: uuid("ledger_account_id").notNull().unique(),
    name: text("name").notNull(),
    kind: financialAccountKindEnum("kind").notNull(),
    provider: text("provider").notNull().default("INTERNAL"),
    identifier: text("identifier"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("financial_accounts_shop_name_unique").on(table.shopId, table.name),
    uniqueIndex("financial_accounts_shop_id_unique").on(table.shopId, table.id),
    uniqueIndex("financial_accounts_provider_identifier_unique")
      .on(table.shopId, table.provider, table.identifier)
      .where(sql`${table.identifier} IS NOT NULL`),
    index("financial_accounts_shop_kind_idx").on(table.shopId, table.kind),
    check("financial_accounts_provider_not_empty", sql`length(trim(${table.provider})) > 0`),
    foreignKey({
      columns: [table.shopId, table.ledgerAccountId],
      foreignColumns: [ledgerAccounts.shopId, ledgerAccounts.id],
      name: "financial_accounts_shop_ledger_fk",
    }).onDelete("restrict"),
  ],
);

export const accountTransfers = pgTable(
  "account_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    documentNo: text("document_no").notNull(),
    sourceAccountId: uuid("source_account_id").notNull(),
    destinationAccountId: uuid("destination_account_id").notNull(),
    amount: money("amount").notNull(),
    reason: text("reason"),
    createdBy: text("created_by").notNull(),
    completedAt: timestampNow("completed_at"),
  },
  (table) => [
    uniqueIndex("account_transfers_shop_document_unique").on(table.shopId, table.documentNo),
    index("account_transfers_source_idx").on(table.sourceAccountId),
    index("account_transfers_destination_idx").on(table.destinationAccountId),
    check("account_transfers_amount_positive", sql`${table.amount} > 0`),
    check("account_transfers_distinct_accounts", sql`${table.sourceAccountId} <> ${table.destinationAccountId}`),
    foreignKey({
      columns: [table.shopId, table.sourceAccountId],
      foreignColumns: [financialAccounts.shopId, financialAccounts.id],
      name: "account_transfers_shop_source_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.destinationAccountId],
      foreignColumns: [financialAccounts.shopId, financialAccounts.id],
      name: "account_transfers_shop_destination_fk",
    }).onDelete("restrict"),
  ],
);
