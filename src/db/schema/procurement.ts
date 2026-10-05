import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { purchaseStatusEnum } from "./enums";
import { createdAt, money, timestampNow, updatedAt } from "./helpers";
import { productVariants } from "./catalog";
import { shops } from "./shops";
import { financialAccounts } from "./accounts";

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("suppliers_shop_name_unique").on(table.shopId, table.name),
    uniqueIndex("suppliers_shop_id_unique").on(table.shopId, table.id),
  ],
);

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    documentNo: text("document_no").notNull(),
    supplierId: uuid("supplier_id"),
    status: purchaseStatusEnum("status").notNull().default("DRAFT"),
    purchaseDate: date("purchase_date", { mode: "string" }).notNull(),
    subtotal: money("subtotal").notNull(),
    discountAmount: money("discount_amount").notNull().default("0.00"),
    totalAmount: money("total_amount").notNull(),
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    postedBy: text("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("purchases_shop_document_unique").on(table.shopId, table.documentNo),
    uniqueIndex("purchases_shop_id_unique").on(table.shopId, table.id),
    index("purchases_supplier_idx").on(table.supplierId),
    index("purchases_shop_date_idx").on(table.shopId, table.purchaseDate),
    check("purchases_subtotal_non_negative", sql`${table.subtotal} >= 0`),
    check("purchases_discount_non_negative", sql`${table.discountAmount} >= 0`),
    check("purchases_total_non_negative", sql`${table.totalAmount} >= 0`),
    check("purchases_total_formula", sql`${table.totalAmount} = ${table.subtotal} - ${table.discountAmount}`),
    foreignKey({
      columns: [table.shopId, table.supplierId],
      foreignColumns: [suppliers.shopId, suppliers.id],
      name: "purchases_shop_supplier_fk",
    }).onDelete("restrict"),
  ],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    purchaseId: uuid("purchase_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    quantity: integer("quantity").notNull(),
    unitCost: money("unit_cost").notNull(),
    discountAmount: money("discount_amount").notNull().default("0.00"),
    lineTotal: money("line_total").notNull(),
  },
  (table) => [
    uniqueIndex("purchase_items_shop_id_unique").on(table.shopId, table.id),
    index("purchase_items_purchase_idx").on(table.purchaseId),
    index("purchase_items_variant_idx").on(table.variantId),
    check("purchase_items_quantity_positive", sql`${table.quantity} > 0`),
    check("purchase_items_unit_cost_non_negative", sql`${table.unitCost} >= 0`),
    check("purchase_items_discount_non_negative", sql`${table.discountAmount} >= 0`),
    check("purchase_items_line_total_non_negative", sql`${table.lineTotal} >= 0`),
    check(
      "purchase_items_line_total_formula",
      sql`${table.lineTotal} = (${table.quantity} * ${table.unitCost}) - ${table.discountAmount}`,
    ),
    foreignKey({
      columns: [table.shopId, table.purchaseId],
      foreignColumns: [purchases.shopId, purchases.id],
      name: "purchase_items_shop_purchase_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.variantId],
      foreignColumns: [productVariants.shopId, productVariants.id],
      name: "purchase_items_shop_variant_fk",
    }).onDelete("restrict"),
  ],
);

export const purchasePayments = pgTable(
  "purchase_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    purchaseId: uuid("purchase_id").notNull(),
    financialAccountId: uuid("financial_account_id").notNull(),
    amount: money("amount").notNull(),
    paidAt: timestampNow("paid_at"),
    createdBy: text("created_by").notNull(),
  },
  (table) => [
    index("purchase_payments_purchase_idx").on(table.purchaseId),
    index("purchase_payments_account_idx").on(table.financialAccountId),
    check("purchase_payments_amount_positive", sql`${table.amount} > 0`),
    foreignKey({
      columns: [table.shopId, table.purchaseId],
      foreignColumns: [purchases.shopId, purchases.id],
      name: "purchase_payments_shop_purchase_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.financialAccountId],
      foreignColumns: [financialAccounts.shopId, financialAccounts.id],
      name: "purchase_payments_shop_account_fk",
    }).onDelete("restrict"),
  ],
);
