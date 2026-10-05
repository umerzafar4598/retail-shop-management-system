import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./helpers";

export const shops = pgTable("shops", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  currency: text("currency").notNull().default("PKR"),
  timezone: text("timezone").notNull().default("Asia/Karachi"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const shopSettings = pgTable("shop_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  shopId: uuid("shop_id")
    .notNull()
    .unique()
    .references(() => shops.id, { onDelete: "cascade" }),
  phone: text("phone"),
  address: text("address"),
  receiptHeader: text("receipt_header"),
  receiptFooter: text("receipt_footer"),
  logoUrl: text("logo_url"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
