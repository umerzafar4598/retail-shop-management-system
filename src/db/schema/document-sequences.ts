import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { shops } from "./shops";

export const documentSequences = pgTable(
  "document_sequences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    year: integer("year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (table) => [
    uniqueIndex("document_sequences_shop_type_year_unique").on(
      table.shopId,
      table.documentType,
      table.year,
    ),
    check("document_sequences_year_valid", sql`${table.year} >= 2000`),
    check("document_sequences_last_value_non_negative", sql`${table.lastValue} >= 0`),
  ],
);
