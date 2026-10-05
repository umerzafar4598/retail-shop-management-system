import {
  boolean,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

import { shops } from "./shops";
import { createdAt, updatedAt } from "./helpers";
import { membershipStatusEnum } from "./enums";

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("roles_shop_name_unique").on(table.shopId, table.name),
    uniqueIndex("roles_shop_id_unique").on(table.shopId, table.id),
  ],
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    description: text("description"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("permissions_key_unique").on(table.key)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const shopMemberships = pgTable(
  "shop_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    // Better Auth's default user id is a string. The FK will be added
    // when the Better Auth schema is integrated in Phase 4.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "cascade",
      }),
    roleId: uuid("role_id").notNull(),
    status: membershipStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("shop_memberships_shop_user_unique").on(table.shopId, table.userId),
    index("shop_memberships_role_idx").on(table.roleId),
    foreignKey({
      columns: [table.shopId, table.roleId],
      foreignColumns: [roles.shopId, roles.id],
      name: "shop_memberships_shop_role_fk",
    }).onDelete("restrict"),
  ],
);
