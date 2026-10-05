import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { cashSessionStatusEnum } from "./enums";
import { createdAt, money, timestampNow } from "./helpers";
import { financialAccounts } from "./accounts";
import { shops } from "./shops";

export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    financialAccountId: uuid("financial_account_id").notNull(),
    openingAmount: money("opening_amount").notNull(),
    openingLedgerBalance: money("opening_ledger_balance").notNull(),
    expectedClosingAmount: money("expected_closing_amount"),
    actualClosingAmount: money("actual_closing_amount"),
    difference: money("difference"),
    status: cashSessionStatusEnum("status").notNull().default("OPEN"),
    openedBy: text("opened_by").notNull(),
    openedAt: timestampNow("opened_at"),
    closedBy: text("closed_by"),
    closedAt: timestamp("closed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("cash_sessions_shop_id_unique").on(table.shopId, table.id),
    index("cash_sessions_shop_created_idx").on(table.shopId, table.openedAt),
    uniqueIndex("cash_sessions_one_open_per_account_idx")
      .on(table.financialAccountId)
      .where(sql`${table.status} = 'OPEN'`),
    check("cash_sessions_opening_non_negative", sql`${table.openingAmount} >= 0`),
    check("cash_sessions_opening_ledger_non_negative", sql`${table.openingLedgerBalance} >= 0`),
    check("cash_sessions_expected_non_negative", sql`${table.expectedClosingAmount} IS NULL OR ${table.expectedClosingAmount} >= 0`),
    check("cash_sessions_actual_non_negative", sql`${table.actualClosingAmount} IS NULL OR ${table.actualClosingAmount} >= 0`),
    foreignKey({
      columns: [table.shopId, table.financialAccountId],
      foreignColumns: [financialAccounts.shopId, financialAccounts.id],
      name: "cash_sessions_shop_account_fk",
    }).onDelete("restrict"),
  ],
);
