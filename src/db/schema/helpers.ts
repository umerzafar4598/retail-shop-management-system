import { numeric, timestamp } from "drizzle-orm/pg-core";

export const money = (columnName: string) =>
  numeric(columnName, { precision: 14, scale: 2 });

export const timestampNow = (columnName: string) =>
  timestamp(columnName, { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow();

export const createdAt = () => timestampNow("created_at");

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
