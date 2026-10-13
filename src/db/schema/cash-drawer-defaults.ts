import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { createdAt, updatedAt } from "./helpers";
import { financialAccounts } from "./accounts";
import { shops } from "./shops";

/** Workflow defaults only; each drawer's balance and history remain ledger-backed. */
export const cashDrawerDefaults = pgTable(
  "cash_drawer_defaults",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    purpose: text("purpose").notNull(),
    financialAccountId: uuid("financial_account_id").notNull(),
    assignedBy: text("assigned_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("cash_drawer_defaults_shop_purpose_unique").on(table.shopId, table.purpose),
    uniqueIndex("cash_drawer_defaults_shop_account_unique").on(table.shopId, table.financialAccountId),
    index("cash_drawer_defaults_account_idx").on(table.financialAccountId),
    check("cash_drawer_defaults_purpose_valid", sql`${table.purpose} IN ('RETAIL', 'SERVICES')`),
    foreignKey({
      columns: [table.shopId, table.financialAccountId],
      foreignColumns: [financialAccounts.shopId, financialAccounts.id],
      name: "cash_drawer_defaults_shop_account_fk",
    }).onDelete("restrict"),
  ],
);
