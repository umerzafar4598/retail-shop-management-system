import {
  boolean,
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

import { createdAt, money, updatedAt } from "./helpers";
import { shops } from "./shops";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("categories_shop_name_unique").on(table.shopId, table.name),
    uniqueIndex("categories_shop_id_unique").on(table.shopId, table.id),
    index("categories_parent_idx").on(table.parentId),
    foreignKey({
      columns: [table.shopId, table.parentId],
      foreignColumns: [table.shopId, table.id],
      name: "categories_shop_parent_fk",
    }).onDelete("restrict"),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("brands_shop_name_unique").on(table.shopId, table.name),
    uniqueIndex("brands_shop_id_unique").on(table.shopId, table.id),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull(),
    brandId: uuid("brand_id"),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("products_shop_name_unique").on(table.shopId, table.name),
    uniqueIndex("products_shop_id_unique").on(table.shopId, table.id),
    index("products_category_idx").on(table.categoryId),
    index("products_brand_idx").on(table.brandId),
    foreignKey({
      columns: [table.shopId, table.categoryId],
      foreignColumns: [categories.shopId, categories.id],
      name: "products_shop_category_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.brandId],
      foreignColumns: [brands.shopId, brands.id],
      name: "products_shop_brand_fk",
    }).onDelete("restrict"),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    sellingPrice: money("selling_price").notNull(),
    trackByImei: boolean("track_by_imei").notNull().default(false),
    reorderLevel: integer("reorder_level").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("product_variants_shop_sku_unique").on(table.shopId, table.sku),
    uniqueIndex("product_variants_shop_barcode_unique").on(table.shopId, table.barcode),
    uniqueIndex("product_variants_shop_id_unique").on(table.shopId, table.id),
    index("product_variants_shop_idx").on(table.shopId),
    index("product_variants_product_idx").on(table.productId),
    check("product_variants_price_non_negative", sql`${table.sellingPrice} >= 0`),
    check("product_variants_reorder_non_negative", sql`${table.reorderLevel} >= 0`),
    foreignKey({
      columns: [table.shopId, table.productId],
      foreignColumns: [products.shopId, products.id],
      name: "product_variants_shop_product_fk",
    }).onDelete("restrict"),
  ],
);
