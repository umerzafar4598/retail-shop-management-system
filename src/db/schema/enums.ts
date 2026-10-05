import { pgEnum } from "drizzle-orm/pg-core";

export const membershipStatusEnum = pgEnum("membership_status", [
  "ACTIVE",
  "INVITED",
  "SUSPENDED",
]);

export const ledgerAccountTypeEnum = pgEnum("ledger_account_type", [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
]);

export const normalBalanceEnum = pgEnum("normal_balance", [
  "DEBIT",
  "CREDIT",
]);

export const financialAccountKindEnum = pgEnum("financial_account_kind", [
  "CASH",
  "DIGITAL_WALLET",
  "BANK",
  "OTHER",
]);

export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", [
  "OPENING",
  "PURCHASE",
  "SALE",
  "RETURN",
  "ADJUSTMENT",
  "DAMAGE",
  "OTHER",
]);

export const imeiDeviceStatusEnum = pgEnum("imei_device_status", [
  "IN_STOCK",
  "SOLD",
  "RETURNED",
  "DAMAGED",
  "RESERVED",
]);

export const purchaseStatusEnum = pgEnum("purchase_status", [
  "DRAFT",
  "POSTED",
  "CANCELLED",
]);

export const saleStatusEnum = pgEnum("sale_status", [
  "COMPLETED",
  "VOIDED",
]);

export const returnStatusEnum = pgEnum("return_status", [
  "COMPLETED",
  "CANCELLED",
]);

export const returnConditionEnum = pgEnum("return_condition", [
  "RESTOCK",
  "DAMAGED",
  "OTHER",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "UNPAID",
  "RECEIVED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);

export const serviceStatusEnum = pgEnum("service_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "REVERSED",
]);

export const providerMoneyDirectionEnum = pgEnum("provider_money_direction", [
  "IN",
  "OUT",
  "NONE",
]);

export const expenseStatusEnum = pgEnum("expense_status", [
  "POSTED",
  "VOIDED",
]);

export const cashSessionStatusEnum = pgEnum("cash_session_status", [
  "OPEN",
  "CLOSED",
  "RECONCILIATION_REQUIRED",
]);

