import {
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

import { returnConditionEnum, returnStatusEnum } from "./enums";
import { createdAt, money, timestampNow } from "./helpers";
import { sales, saleItems } from "./sales";
import { imeiDevices } from "./inventory";
import { shops } from "./shops";
import { financialAccounts } from "./accounts";

export const saleReturns = pgTable(
  "sale_returns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    documentNo: text("document_no").notNull(),
    originalSaleId: uuid("original_sale_id").notNull(),
    replacementSaleId: uuid("replacement_sale_id"),
    status: returnStatusEnum("status").notNull().default("COMPLETED"),
    reason: text("reason"),
    refundAmount: money("refund_amount").notNull().default("0.00"),
    createdBy: text("created_by").notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("sale_returns_shop_document_unique").on(table.shopId, table.documentNo),
    uniqueIndex("sale_returns_shop_id_unique").on(table.shopId, table.id),
    index("sale_returns_original_sale_idx").on(table.originalSaleId),
    index("sale_returns_replacement_sale_idx").on(table.replacementSaleId),
    check("sale_returns_refund_non_negative", sql`${table.refundAmount} >= 0`),
    foreignKey({
      columns: [table.shopId, table.originalSaleId],
      foreignColumns: [sales.shopId, sales.id],
      name: "sale_returns_shop_original_sale_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.replacementSaleId],
      foreignColumns: [sales.shopId, sales.id],
      name: "sale_returns_shop_replacement_sale_fk",
    }).onDelete("restrict"),
  ],
);

export const saleReturnItems = pgTable(
  "sale_return_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    returnId: uuid("return_id").notNull(),
    saleItemId: uuid("sale_item_id").notNull(),
    imeiDeviceId: uuid("imei_device_id"),
    quantity: integer("quantity").notNull(),
    amount: money("amount").notNull(),
    condition: returnConditionEnum("condition").notNull().default("RESTOCK"),
  },
  (table) => [
    index("sale_return_items_return_idx").on(table.returnId),
    index("sale_return_items_sale_item_idx").on(table.saleItemId),
    index("sale_return_items_imei_idx").on(table.imeiDeviceId),
    check("sale_return_items_quantity_positive", sql`${table.quantity} > 0`),
    check("sale_return_items_amount_non_negative", sql`${table.amount} >= 0`),
    foreignKey({
      columns: [table.shopId, table.returnId],
      foreignColumns: [saleReturns.shopId, saleReturns.id],
      name: "sale_return_items_shop_return_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.saleItemId],
      foreignColumns: [saleItems.shopId, saleItems.id],
      name: "sale_return_items_shop_sale_item_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.imeiDeviceId],
      foreignColumns: [imeiDevices.shopId, imeiDevices.id],
      name: "sale_return_items_shop_imei_fk",
    }).onDelete("restrict"),
  ],
);

export const returnRefunds = pgTable(
  "return_refunds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    returnId: uuid("return_id").notNull(),
    financialAccountId: uuid("financial_account_id").notNull(),
    amount: money("amount").notNull(),
    refundedAt: timestampNow("refunded_at"),
    createdBy: text("created_by").notNull(),
  },
  (table) => [
    index("return_refunds_return_idx").on(table.returnId),
    index("return_refunds_account_idx").on(table.financialAccountId),
    check("return_refunds_amount_positive", sql`${table.amount} > 0`),
    foreignKey({
      columns: [table.shopId, table.returnId],
      foreignColumns: [saleReturns.shopId, saleReturns.id],
      name: "return_refunds_shop_return_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.financialAccountId],
      foreignColumns: [financialAccounts.shopId, financialAccounts.id],
      name: "return_refunds_shop_account_fk",
    }).onDelete("restrict"),
  ],
);
