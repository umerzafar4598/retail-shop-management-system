import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { expenseStatusEnum } from "./enums";
import { createdAt, money, updatedAt } from "./helpers";
import { shops } from "./shops";
import { ledgerAccounts } from "./ledger";
import { financialAccounts } from "./accounts";

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    ledgerAccountId: uuid("ledger_account_id").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("expense_categories_shop_name_unique").on(table.shopId, table.name),
    uniqueIndex("expense_categories_shop_id_unique").on(table.shopId, table.id),
    foreignKey({
      columns: [table.shopId, table.ledgerAccountId],
      foreignColumns: [ledgerAccounts.shopId, ledgerAccounts.id],
      name: "expense_categories_shop_ledger_fk",
    }).onDelete("restrict"),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    documentNo: text("document_no").notNull(),
    categoryId: uuid("category_id").notNull(),
    financialAccountId: uuid("financial_account_id").notNull(),
    amount: money("amount").notNull(),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    payee: text("payee"),
    notes: text("notes"),
    status: expenseStatusEnum("status").notNull().default("POSTED"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("expenses_shop_document_unique").on(table.shopId, table.documentNo),
    index("expenses_shop_date_idx").on(table.shopId, table.expenseDate),
    index("expenses_category_idx").on(table.categoryId),
    index("expenses_account_idx").on(table.financialAccountId),
    check("expenses_amount_positive", sql`${table.amount} > 0`),
    foreignKey({
      columns: [table.shopId, table.categoryId],
      foreignColumns: [expenseCategories.shopId, expenseCategories.id],
      name: "expenses_shop_category_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.financialAccountId],
      foreignColumns: [financialAccounts.shopId, financialAccounts.id],
      name: "expenses_shop_account_fk",
    }).onDelete("restrict"),
  ],
);
