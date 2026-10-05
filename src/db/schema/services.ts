import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import {
  paymentStatusEnum,
  providerMoneyDirectionEnum,
  serviceStatusEnum,
} from "./enums";
import { createdAt, money, timestampNow, updatedAt } from "./helpers";
import { shops } from "./shops";
import { customers } from "./sales";
import { financialAccounts } from "./accounts";

export const serviceTypes = pgTable(
  "service_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default("OTHER"),
    defaultFee: money("default_fee").notNull().default("0.00"),
    providerMoneyDirection: providerMoneyDirectionEnum("provider_money_direction")
      .notNull()
      .default("NONE"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("service_types_shop_code_unique").on(table.shopId, table.code),
    uniqueIndex("service_types_shop_id_unique").on(table.shopId, table.id),
    index("service_types_shop_active_idx").on(table.shopId, table.active),
    check("service_types_default_fee_non_negative", sql`${table.defaultFee} >= 0`),
  ],
);

export const serviceTransactions = pgTable(
  "service_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    documentNo: text("document_no").notNull(),
    serviceTypeId: uuid("service_type_id").notNull(),
    customerId: uuid("customer_id"),
    principalAmount: money("principal_amount").notNull(),
    serviceFee: money("service_fee").notNull().default("0.00"),
    totalAmount: money("total_amount").notNull(),
    providerAccountId: uuid("provider_account_id"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("UNPAID"),
    serviceStatus: serviceStatusEnum("service_status").notNull().default("PENDING"),
    externalReference: text("external_reference"),
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    completedBy: text("completed_by"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("service_transactions_shop_document_unique").on(table.shopId, table.documentNo),
    uniqueIndex("service_transactions_shop_id_unique").on(table.shopId, table.id),
    index("service_transactions_shop_created_idx").on(table.shopId, table.createdAt),
    index("service_transactions_type_idx").on(table.serviceTypeId),
    index("service_transactions_provider_account_idx").on(table.providerAccountId),
    index("service_transactions_status_idx").on(table.shopId, table.serviceStatus),
    index("service_transactions_external_ref_idx").on(table.externalReference),
    check("service_transactions_principal_non_negative", sql`${table.principalAmount} >= 0`),
    check("service_transactions_fee_non_negative", sql`${table.serviceFee} >= 0`),
    check("service_transactions_total_non_negative", sql`${table.totalAmount} >= 0`),
    check("service_transactions_total_formula", sql`${table.totalAmount} = ${table.principalAmount} + ${table.serviceFee}`),
    foreignKey({
      columns: [table.shopId, table.serviceTypeId],
      foreignColumns: [serviceTypes.shopId, serviceTypes.id],
      name: "service_transactions_shop_type_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.customerId],
      foreignColumns: [customers.shopId, customers.id],
      name: "service_transactions_shop_customer_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.providerAccountId],
      foreignColumns: [financialAccounts.shopId, financialAccounts.id],
      name: "service_transactions_shop_provider_fk",
    }).onDelete("restrict"),
  ],
);

export const servicePayments = pgTable(
  "service_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    serviceTransactionId: uuid("service_transaction_id").notNull(),
    financialAccountId: uuid("financial_account_id").notNull(),
    amount: money("amount").notNull(),
    paidAt: timestampNow("paid_at"),
    createdBy: text("created_by").notNull(),
  },
  (table) => [
    index("service_payments_transaction_idx").on(table.serviceTransactionId),
    index("service_payments_account_idx").on(table.financialAccountId),
    check("service_payments_amount_positive", sql`${table.amount} > 0`),
    foreignKey({
      columns: [table.shopId, table.serviceTransactionId],
      foreignColumns: [serviceTransactions.shopId, serviceTransactions.id],
      name: "service_payments_shop_transaction_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.financialAccountId],
      foreignColumns: [financialAccounts.shopId, financialAccounts.id],
      name: "service_payments_shop_account_fk",
    }).onDelete("restrict"),
  ],
);
