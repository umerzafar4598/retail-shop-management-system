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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { saleStatusEnum } from "./enums";
import { createdAt, money, timestampNow, updatedAt } from "./helpers";
import { productVariants } from "./catalog";
import { imeiDevices } from "./inventory";
import { shops } from "./shops";
import { financialAccounts } from "./accounts";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("customers_shop_name_idx").on(table.shopId, table.name),
    uniqueIndex("customers_shop_id_unique").on(table.shopId, table.id),
  ],
);

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    documentNo: text("document_no").notNull(),
    customerId: uuid("customer_id"),
    status: saleStatusEnum("status").notNull().default("COMPLETED"),
    subtotal: money("subtotal").notNull(),
    discountAmount: money("discount_amount").notNull().default("0.00"),
    totalAmount: money("total_amount").notNull(),
    createdBy: text("created_by").notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("sales_shop_document_unique").on(table.shopId, table.documentNo),
    uniqueIndex("sales_shop_id_unique").on(table.shopId, table.id),
    index("sales_shop_created_idx").on(table.shopId, table.createdAt),
    index("sales_customer_idx").on(table.customerId),
    check("sales_subtotal_non_negative", sql`${table.subtotal} >= 0`),
    check("sales_discount_non_negative", sql`${table.discountAmount} >= 0`),
    check("sales_total_non_negative", sql`${table.totalAmount} >= 0`),
    check("sales_total_formula", sql`${table.totalAmount} = ${table.subtotal} - ${table.discountAmount}`),
    foreignKey({
      columns: [table.shopId, table.customerId],
      foreignColumns: [customers.shopId, customers.id],
      name: "sales_shop_customer_fk",
    }).onDelete("restrict"),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    saleId: uuid("sale_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    imeiDeviceId: uuid("imei_device_id"),
    descriptionSnapshot: text("description_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    discountAmount: money("discount_amount").notNull().default("0.00"),
    lineTotal: money("line_total").notNull(),
    costSnapshot: money("cost_snapshot").notNull(),
  },
  (table) => [
    uniqueIndex("sale_items_shop_id_unique").on(table.shopId, table.id),
    index("sale_items_sale_idx").on(table.saleId),
    index("sale_items_variant_idx").on(table.variantId),
    index("sale_items_imei_idx").on(table.imeiDeviceId),
    check("sale_items_quantity_positive", sql`${table.quantity} > 0`),
    check("sale_items_unit_price_non_negative", sql`${table.unitPrice} >= 0`),
    check("sale_items_discount_non_negative", sql`${table.discountAmount} >= 0`),
    check("sale_items_line_total_non_negative", sql`${table.lineTotal} >= 0`),
    check("sale_items_cost_non_negative", sql`${table.costSnapshot} >= 0`),
    check(
      "sale_items_line_total_formula",
      sql`${table.lineTotal} = (${table.quantity} * ${table.unitPrice}) - ${table.discountAmount}`,
    ),
    check(
      "sale_items_imei_quantity_rule",
      sql`${table.imeiDeviceId} IS NULL OR ${table.quantity} = 1`,
    ),
    foreignKey({
      columns: [table.shopId, table.saleId],
      foreignColumns: [sales.shopId, sales.id],
      name: "sale_items_shop_sale_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.variantId],
      foreignColumns: [productVariants.shopId, productVariants.id],
      name: "sale_items_shop_variant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.imeiDeviceId],
      foreignColumns: [imeiDevices.shopId, imeiDevices.id],
      name: "sale_items_shop_imei_fk",
    }).onDelete("restrict"),
  ],
);

export const salePayments = pgTable(
  "sale_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    saleId: uuid("sale_id").notNull(),
    financialAccountId: uuid("financial_account_id").notNull(),
    amount: money("amount").notNull(),
    paidAt: timestampNow("paid_at"),
    createdBy: text("created_by").notNull(),
  },
  (table) => [
    index("sale_payments_sale_idx").on(table.saleId),
    index("sale_payments_account_idx").on(table.financialAccountId),
    check("sale_payments_amount_positive", sql`${table.amount} > 0`),
    foreignKey({
      columns: [table.shopId, table.saleId],
      foreignColumns: [sales.shopId, sales.id],
      name: "sale_payments_shop_sale_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.financialAccountId],
      foreignColumns: [financialAccounts.shopId, financialAccounts.id],
      name: "sale_payments_shop_account_fk",
    }).onDelete("restrict"),
  ],
);
