import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { imeiDeviceStatusEnum, inventoryMovementTypeEnum } from "./enums";
import { createdAt, money, updatedAt } from "./helpers";
import { productVariants } from "./catalog";
import { shops } from "./shops";
import { purchaseItems } from "./procurement";

export const inventoryBalances = pgTable(
  "inventory_balances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull(),
    quantity: integer("quantity").notNull().default(0),
    averageCost: money("average_cost").notNull().default("0.00"),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("inventory_balances_shop_variant_unique").on(table.shopId, table.variantId),
    index("inventory_balances_shop_variant_idx").on(table.shopId, table.variantId),
    check("inventory_balances_quantity_non_negative", sql`${table.quantity} >= 0`),
    check("inventory_balances_average_cost_non_negative", sql`${table.averageCost} >= 0`),
    foreignKey({
      columns: [table.shopId, table.variantId],
      foreignColumns: [productVariants.shopId, productVariants.id],
      name: "inventory_balances_shop_variant_fk",
    }).onDelete("restrict"),
  ],
);

export const imeiDevices = pgTable(
  "imei_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").notNull(),
    imei1: text("imei_1").notNull(),
    imei2: text("imei_2"),
    serialNumber: text("serial_number"),
    purchaseItemId: uuid("purchase_item_id"),
    purchaseCost: money("purchase_cost").notNull(),
    status: imeiDeviceStatusEnum("status").notNull().default("IN_STOCK"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("imei_devices_shop_imei1_unique").on(table.shopId, table.imei1),
    uniqueIndex("imei_devices_shop_imei2_unique").on(table.shopId, table.imei2),
    uniqueIndex("imei_devices_shop_id_unique").on(table.shopId, table.id),
    index("imei_devices_variant_idx").on(table.variantId),
    index("imei_devices_purchase_item_idx").on(table.purchaseItemId),
    check("imei_devices_purchase_cost_non_negative", sql`${table.purchaseCost} >= 0`),
    foreignKey({
      columns: [table.shopId, table.variantId],
      foreignColumns: [productVariants.shopId, productVariants.id],
      name: "imei_devices_shop_variant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.purchaseItemId],
      foreignColumns: [purchaseItems.shopId, purchaseItems.id],
      name: "imei_devices_shop_purchase_item_fk",
    }).onDelete("restrict"),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").notNull(),
    imeiDeviceId: uuid("imei_device_id"),
    quantityDelta: integer("quantity_delta").notNull(),
    movementType: inventoryMovementTypeEnum("movement_type").notNull(),
    unitCost: money("unit_cost"),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("inventory_movements_shop_variant_idx").on(table.shopId, table.variantId),
    index("inventory_movements_imei_idx").on(table.imeiDeviceId),
    index("inventory_movements_reference_idx").on(table.referenceType, table.referenceId),
    index("inventory_movements_created_idx").on(table.shopId, table.createdAt),
    check("inventory_movements_quantity_non_zero", sql`${table.quantityDelta} <> 0`),
    check("inventory_movements_unit_cost_non_negative", sql`${table.unitCost} IS NULL OR ${table.unitCost} >= 0`),
    foreignKey({
      columns: [table.shopId, table.variantId],
      foreignColumns: [productVariants.shopId, productVariants.id],
      name: "inventory_movements_shop_variant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.imeiDeviceId],
      foreignColumns: [imeiDevices.shopId, imeiDevices.id],
      name: "inventory_movements_shop_imei_fk",
    }).onDelete("restrict"),
  ],
);
