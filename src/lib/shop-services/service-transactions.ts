import "server-only";

import Decimal from "decimal.js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { getDefaultCashDrawerForShop } from "@/lib/cash/cash-drawer-settings";
import {
  auditLogs,
  customers,
  documentSequences,
  financialAccounts,
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  servicePayments,
  serviceTransactions,
  serviceTypes,
} from "@/db/schema";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MONEY = new Decimal("999999999999.99");
export type ServiceDirection = "IN" | "OUT" | "NONE";
export type ServiceFinalStatus = "FAILED" | "CANCELLED";
type ServiceTransactionDbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type JournalLine = { ledgerAccountId: string; debitCents: number; creditCents: number; description: string };

export class ShopServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopServiceError";
  }
}

function pakistanYear(date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", year: "numeric" }).format(date));
}

function moneyToCents(raw: string | number | Decimal, label: string): number {
  let value: Decimal;
  try {
    value = new Decimal(raw);
  } catch {
    throw new ShopServiceError(`${label} must be a valid amount.`);
  }
  if (!value.isFinite() || value.isNegative() || value.greaterThan(MAX_MONEY) || value.decimalPlaces() > 2) {
    throw new ShopServiceError(`${label} must be between Rs 0.00 and Rs ${MAX_MONEY.toFixed(2)}, with at most two decimal places.`);
  }
  const cents = value.mul(100).toNumber();
  if (!Number.isSafeInteger(cents)) throw new ShopServiceError(`${label} is outside the supported range.`);
  return cents;
}

function parseFormMoney(raw: string, label: string): number {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(raw.trim())) throw new ShopServiceError(`${label} must be a non-negative amount with at most two decimal places.`);
  return moneyToCents(raw.trim(), label);
}

function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new ShopServiceError("A calculated service amount is outside the supported range.");
  return new Decimal(cents).div(100).toFixed(2);
}

function centsToNumber(value: string): number {
  return new Decimal(value).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function parseUuid(value: string, label: string, optional = false): string | null {
  const trimmed = value.trim();
  if (optional && trimmed === "") return null;
  if (!UUID_PATTERN.test(trimmed)) throw new ShopServiceError(`${label} is invalid. Refresh and select it again.`);
  return trimmed;
}

async function getPostableFinancialAccount(tx: ServiceTransactionDbTx, shopId: string, accountId: string) {
  const [account] = await tx.select({
    id: financialAccounts.id,
    name: financialAccounts.name,
    kind: financialAccounts.kind,
    provider: financialAccounts.provider,
    ledgerAccountId: ledgerAccounts.id,
    ledgerCode: ledgerAccounts.code,
    ledgerName: ledgerAccounts.name,
    accountType: ledgerAccounts.accountType,
    normalBalance: ledgerAccounts.normalBalance,
  }).from(financialAccounts)
    .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, financialAccounts.shopId), eq(ledgerAccounts.id, financialAccounts.ledgerAccountId)))
    .where(and(eq(financialAccounts.shopId, shopId), eq(financialAccounts.id, accountId), eq(financialAccounts.isActive, true), eq(ledgerAccounts.active, true)))
    .for("update")
    .limit(1);
  if (!account) throw new ShopServiceError("The selected financial account is missing, inactive, or belongs to another shop.");
  if (account.accountType !== "ASSET" || account.normalBalance !== "DEBIT") {
    throw new ShopServiceError(`${account.name} is not configured as a debit-normal financial asset account.`);
  }
  const [child] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.shopId, shopId), eq(ledgerAccounts.parentId, account.ledgerAccountId))).limit(1);
  if (child) throw new ShopServiceError(`Choose a specific leaf financial account instead of the parent account ${account.ledgerName}.`);
  return account;
}

async function accountBalanceCents(tx: ServiceTransactionDbTx, shopId: string, ledgerAccountId: string): Promise<number> {
  const [row] = await tx.select({ balance: sql<string>`COALESCE(SUM(${ledgerEntries.debit}::numeric - ${ledgerEntries.credit}::numeric), 0)::text` })
    .from(ledgerEntries).where(and(eq(ledgerEntries.shopId, shopId), eq(ledgerEntries.ledgerAccountId, ledgerAccountId)));
  return centsToNumber(row?.balance ?? "0.00");
}

async function getLedgerAccountByCode(tx: ServiceTransactionDbTx, shopId: string, code: string, expectedType: string, expectedNormalBalance: string) {
  const [account] = await tx.select({ id: ledgerAccounts.id, code: ledgerAccounts.code, name: ledgerAccounts.name, accountType: ledgerAccounts.accountType, normalBalance: ledgerAccounts.normalBalance, active: ledgerAccounts.active })
    .from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, shopId), eq(ledgerAccounts.code, code))).for("update").limit(1);
  if (!account || !account.active || account.accountType !== expectedType || account.normalBalance !== expectedNormalBalance) {
    throw new ShopServiceError(`Ledger account ${code} is missing, inactive, or incorrectly configured. Check the chart of accounts before posting this service.`);
  }
  const [child] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.shopId, shopId), eq(ledgerAccounts.parentId, account.id))).limit(1);
  if (child) throw new ShopServiceError(`Ledger account ${code} is a parent account and cannot receive direct postings.`);
  return account;
}

async function getOrCreateServiceClearing(tx: ServiceTransactionDbTx, shopId: string) {
  let [account] = await tx.select({ id: ledgerAccounts.id, code: ledgerAccounts.code, name: ledgerAccounts.name, accountType: ledgerAccounts.accountType, normalBalance: ledgerAccounts.normalBalance, active: ledgerAccounts.active })
    .from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, shopId), eq(ledgerAccounts.systemKey, "SERVICE_CLEARING"))).for("update").limit(1);
  if (!account) {
    [account] = await tx.select({ id: ledgerAccounts.id, code: ledgerAccounts.code, name: ledgerAccounts.name, accountType: ledgerAccounts.accountType, normalBalance: ledgerAccounts.normalBalance, active: ledgerAccounts.active })
      .from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, shopId), eq(ledgerAccounts.code, "2200"))).for("update").limit(1);
  }
  if (!account) {
    await tx.insert(ledgerAccounts).values({
      shopId,
      code: "2200",
      name: "Service Clearing",
      accountType: "LIABILITY",
      normalBalance: "CREDIT",
      systemKey: "SERVICE_CLEARING",
      isSystem: true,
      active: true,
    }).onConflictDoNothing({ target: [ledgerAccounts.shopId, ledgerAccounts.code] });
    [account] = await tx.select({ id: ledgerAccounts.id, code: ledgerAccounts.code, name: ledgerAccounts.name, accountType: ledgerAccounts.accountType, normalBalance: ledgerAccounts.normalBalance, active: ledgerAccounts.active })
      .from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, shopId), eq(ledgerAccounts.code, "2200"))).for("update").limit(1);
  }
  if (!account || account.code !== "2200" || !account.active || account.accountType !== "LIABILITY" || account.normalBalance !== "CREDIT") {
    throw new ShopServiceError("Ledger code 2200 must be the active Service Clearing Liability account with Credit normal balance. If SERVICE_CLEARING exists under another code, reconcile its setup before posting.");
  }
  const [child] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.shopId, shopId), eq(ledgerAccounts.parentId, account.id))).limit(1);
  if (child) throw new ShopServiceError("Ledger account 2200 is a parent account; service clearing must be a leaf account.");
  return account;
}

async function postJournal(tx: ServiceTransactionDbTx, input: { shopId: string; createdBy: string; referenceType: string; referenceId: string; description: string; lines: JournalLine[] }) {
  const lines = input.lines.filter((line) => line.debitCents > 0 || line.creditCents > 0);
  const debits = lines.reduce((sum, line) => sum + line.debitCents, 0);
  const credits = lines.reduce((sum, line) => sum + line.creditCents, 0);
  if (lines.length < 2 || debits <= 0 || debits !== credits) throw new ShopServiceError("The service journal does not balance. Nothing was posted.");
  for (const line of lines) {
    if ((line.debitCents > 0 && line.creditCents > 0) || line.debitCents < 0 || line.creditCents < 0) {
      throw new ShopServiceError("A service journal line must have one positive side only.");
    }
  }
  const [journal] = await tx.insert(ledgerTransactions).values({
    shopId: input.shopId,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    description: input.description,
    createdBy: input.createdBy,
  }).returning({ id: ledgerTransactions.id });
  await tx.insert(ledgerEntries).values(lines.map((line) => ({
    shopId: input.shopId,
    ledgerTransactionId: journal.id,
    ledgerAccountId: line.ledgerAccountId,
    debit: fromCents(line.debitCents),
    credit: fromCents(line.creditCents),
    description: line.description,
  })));
  return journal.id;
}

async function getSelectedActiveServiceType(tx: ServiceTransactionDbTx, shopId: string, serviceTypeId: string) {
  const [type] = await tx.select({ id: serviceTypes.id, code: serviceTypes.code, name: serviceTypes.name, category: serviceTypes.category, defaultFee: serviceTypes.defaultFee, direction: serviceTypes.providerMoneyDirection, active: serviceTypes.active })
    .from(serviceTypes).where(and(eq(serviceTypes.shopId, shopId), eq(serviceTypes.id, serviceTypeId))).for("update").limit(1);
  if (!type || !type.active) throw new ShopServiceError("The selected service type is unavailable or inactive.");
  return type;
}

export const STANDARD_SERVICE_TYPES = [
  { code: "EASYPAISA_DEPOSIT", name: "Easypaisa Deposit", category: "EASYPAISA", providerMoneyDirection: "OUT" as const, defaultFee: "0.00" },
  { code: "EASYPAISA_WITHDRAWAL", name: "Easypaisa Withdrawal", category: "EASYPAISA", providerMoneyDirection: "IN" as const, defaultFee: "0.00" },
  { code: "JAZZCASH_DEPOSIT", name: "JazzCash Deposit", category: "JAZZCASH", providerMoneyDirection: "OUT" as const, defaultFee: "0.00" },
  { code: "JAZZCASH_WITHDRAWAL", name: "JazzCash Withdrawal", category: "JAZZCASH", providerMoneyDirection: "IN" as const, defaultFee: "0.00" },
  { code: "BANK_TRANSFER_OUT", name: "Bank Transfer Out", category: "BANK", providerMoneyDirection: "OUT" as const, defaultFee: "0.00" },
  { code: "BANK_TRANSFER_IN", name: "Bank Transfer In", category: "BANK", providerMoneyDirection: "IN" as const, defaultFee: "0.00" },
  { code: "BILL_PAYMENT", name: "Utility Bill Payment", category: "BILL_PAYMENT", providerMoneyDirection: "OUT" as const, defaultFee: "0.00" },
  { code: "NADRA_BIOMETRIC", name: "NADRA / e-Sahulat Biometric Verification", category: "NADRA", providerMoneyDirection: "NONE" as const, defaultFee: "0.00" },
  { code: "VEHICLE_TRANSFER", name: "Vehicle / Bike Transfer Verification", category: "NADRA", providerMoneyDirection: "NONE" as const, defaultFee: "0.00" },
  { code: "OTHER_SERVICE", name: "Other Shop Service", category: "OTHER", providerMoneyDirection: "NONE" as const, defaultFee: "0.00" },
];

export async function ensureStandardServiceTypesForShop(shopId: string) {
  await db.insert(serviceTypes).values(STANDARD_SERVICE_TYPES.map((type) => ({ shopId, ...type, active: true })))
    .onConflictDoNothing({ target: [serviceTypes.shopId, serviceTypes.code] });
}

export async function getServiceTypeSettingsForShop(shopId: string) {
  await ensureStandardServiceTypesForShop(shopId);
  return db.select({ id: serviceTypes.id, code: serviceTypes.code, name: serviceTypes.name, category: serviceTypes.category, defaultFee: serviceTypes.defaultFee, providerMoneyDirection: serviceTypes.providerMoneyDirection, active: serviceTypes.active })
    .from(serviceTypes).where(eq(serviceTypes.shopId, shopId)).orderBy(asc(serviceTypes.name));
}

export async function createServiceTypeForShop(input: { shopId: string; actorUserId: string; code: string; name: string; category: string; direction: ServiceDirection; defaultFee: string }) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  const category = input.category.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,49}$/.test(code)) throw new ShopServiceError("Service code must start with a letter and contain 3–50 uppercase letters, digits, or underscores.");
  if (name.length < 2 || name.length > 100) throw new ShopServiceError("Service name must be between 2 and 100 characters.");
  if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(category)) throw new ShopServiceError("Category must contain uppercase letters, digits, or underscores.");
  if (!(input.direction === "IN" || input.direction === "OUT" || input.direction === "NONE")) throw new ShopServiceError("Choose a valid provider money direction.");
  const feeCents = parseFormMoney(input.defaultFee, "Default service fee");
  try {
    const [existing] = await db.select({ id: serviceTypes.id }).from(serviceTypes).where(and(eq(serviceTypes.shopId, input.shopId), eq(serviceTypes.code, code))).limit(1);
    if (existing) throw new ShopServiceError("That service code already exists in this shop.");
    await db.transaction(async (tx) => {
      const [created] = await tx.insert(serviceTypes).values({ shopId: input.shopId, code, name, category, providerMoneyDirection: input.direction, defaultFee: fromCents(feeCents), active: true }).returning({ id: serviceTypes.id });
      await tx.insert(auditLogs).values({ shopId: input.shopId, actorUserId: input.actorUserId, action: "SERVICE_TYPE_CREATED", entityType: "SERVICE_TYPE", entityId: created.id, metadata: { code, name, category, direction: input.direction, defaultFee: fromCents(feeCents) } });
    });
  } catch (error) {
    if (error instanceof ShopServiceError) throw error;
    throw new ShopServiceError("The service type could not be saved. Check that its code is unique.");
  }
}

export async function updateServiceTypeForShop(input: { shopId: string; actorUserId: string; serviceTypeId: string; name: string; category: string; direction: ServiceDirection; defaultFee: string; active: boolean }) {
  if (!UUID_PATTERN.test(input.serviceTypeId)) throw new ShopServiceError("Service type reference is invalid.");
  const name = input.name.trim();
  const category = input.category.trim().toUpperCase();
  if (name.length < 2 || name.length > 100) throw new ShopServiceError("Service name must be between 2 and 100 characters.");
  if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(category)) throw new ShopServiceError("Category must contain uppercase letters, digits, or underscores.");
  if (!(input.direction === "IN" || input.direction === "OUT" || input.direction === "NONE")) throw new ShopServiceError("Choose a valid provider money direction.");
  const feeCents = parseFormMoney(input.defaultFee, "Default service fee");
  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: serviceTypes.id, code: serviceTypes.code, name: serviceTypes.name, category: serviceTypes.category, providerMoneyDirection: serviceTypes.providerMoneyDirection, defaultFee: serviceTypes.defaultFee, active: serviceTypes.active })
      .from(serviceTypes).where(and(eq(serviceTypes.shopId, input.shopId), eq(serviceTypes.id, input.serviceTypeId))).for("update").limit(1);
    if (!existing) throw new ShopServiceError("Service type was not found in this shop.");
    const [historicalUse] = await tx.select({ id: serviceTransactions.id }).from(serviceTransactions)
      .where(and(eq(serviceTransactions.shopId, input.shopId), eq(serviceTransactions.serviceTypeId, existing.id))).limit(1);
    if (historicalUse && (existing.name !== name || existing.category !== category || existing.providerMoneyDirection !== input.direction)) {
      throw new ShopServiceError("This service type already has transaction history. Its name, category, and provider direction are locked to preserve historical meaning; you can still update its default fee or active status.");
    }
    await tx.update(serviceTypes).set({ name, category, providerMoneyDirection: input.direction, defaultFee: fromCents(feeCents), active: input.active, updatedAt: new Date() })
      .where(and(eq(serviceTypes.shopId, input.shopId), eq(serviceTypes.id, input.serviceTypeId)));
    await tx.insert(auditLogs).values({ shopId: input.shopId, actorUserId: input.actorUserId, action: "SERVICE_TYPE_UPDATED", entityType: "SERVICE_TYPE", entityId: existing.id, metadata: { code: existing.code, before: { name: existing.name, category: existing.category, direction: existing.providerMoneyDirection, defaultFee: existing.defaultFee, active: existing.active }, after: { name, category, direction: input.direction, defaultFee: fromCents(feeCents), active: input.active } } });
  });
}

export async function getServiceWorkspaceForShop(shopId: string) {
  await ensureStandardServiceTypesForShop(shopId);
  const [types, customerRows, candidateAccounts, recentTransactions] = await Promise.all([
    db.select({ id: serviceTypes.id, code: serviceTypes.code, name: serviceTypes.name, category: serviceTypes.category, defaultFee: serviceTypes.defaultFee, providerMoneyDirection: serviceTypes.providerMoneyDirection })
      .from(serviceTypes).where(and(eq(serviceTypes.shopId, shopId), eq(serviceTypes.active, true))).orderBy(asc(serviceTypes.name)),
    db.select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers)
      .where(and(eq(customers.shopId, shopId), eq(customers.active, true))).orderBy(asc(customers.name)).limit(500),
    db.select({ id: financialAccounts.id, name: financialAccounts.name, kind: financialAccounts.kind, provider: financialAccounts.provider, ledgerAccountId: ledgerAccounts.id })
      .from(financialAccounts).innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, financialAccounts.shopId), eq(ledgerAccounts.id, financialAccounts.ledgerAccountId)))
      .where(and(eq(financialAccounts.shopId, shopId), eq(financialAccounts.isActive, true), eq(ledgerAccounts.active, true), eq(ledgerAccounts.accountType, "ASSET"), eq(ledgerAccounts.normalBalance, "DEBIT")))
      .orderBy(asc(financialAccounts.name)),
    db.select({ id: serviceTransactions.id, documentNo: serviceTransactions.documentNo, principalAmount: serviceTransactions.principalAmount, serviceFee: serviceTransactions.serviceFee, totalAmount: serviceTransactions.totalAmount, paymentStatus: serviceTransactions.paymentStatus, serviceStatus: serviceTransactions.serviceStatus, createdAt: serviceTransactions.createdAt, typeName: serviceTypes.name, direction: serviceTypes.providerMoneyDirection, customerName: customers.name })
      .from(serviceTransactions).innerJoin(serviceTypes, and(eq(serviceTypes.shopId, serviceTransactions.shopId), eq(serviceTypes.id, serviceTransactions.serviceTypeId)))
      .leftJoin(customers, and(eq(customers.shopId, serviceTransactions.shopId), eq(customers.id, serviceTransactions.customerId)))
      .where(eq(serviceTransactions.shopId, shopId)).orderBy(desc(serviceTransactions.createdAt)).limit(100),
  ]);
  const parentRows = candidateAccounts.length > 0
    ? await db.select({ parentId: ledgerAccounts.parentId }).from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, shopId), inArray(ledgerAccounts.parentId, candidateAccounts.map((account) => account.ledgerAccountId))))
    : [];
  const parents = new Set(parentRows.map((row) => row.parentId).filter((id): id is string => id !== null));
  const accounts = candidateAccounts.filter((account) => !parents.has(account.ledgerAccountId)).map(({ ledgerAccountId: _ledgerAccountId, ...account }) => account);
  const defaultServiceCashDrawerId = await getDefaultCashDrawerForShop(shopId, "SERVICES");
  return { types, customers: customerRows, accounts, recentTransactions, defaultServiceCashDrawerId };
}

export async function getServiceDetailForShop(shopId: string, serviceId: string) {
  if (!UUID_PATTERN.test(serviceId)) return null;
  const [service] = await db.select({
    id: serviceTransactions.id,
    documentNo: serviceTransactions.documentNo,
    serviceTypeId: serviceTransactions.serviceTypeId,
    typeCode: serviceTypes.code,
    typeName: serviceTypes.name,
    category: serviceTypes.category,
    direction: serviceTypes.providerMoneyDirection,
    customerId: serviceTransactions.customerId,
    customerName: customers.name,
    principalAmount: serviceTransactions.principalAmount,
    serviceFee: serviceTransactions.serviceFee,
    totalAmount: serviceTransactions.totalAmount,
    providerAccountId: serviceTransactions.providerAccountId,
    providerAccountName: financialAccounts.name,
    paymentStatus: serviceTransactions.paymentStatus,
    serviceStatus: serviceTransactions.serviceStatus,
    externalReference: serviceTransactions.externalReference,
    notes: serviceTransactions.notes,
    failureReason: serviceTransactions.failureReason,
    createdAt: serviceTransactions.createdAt,
    completedAt: serviceTransactions.completedAt,
  }).from(serviceTransactions)
    .innerJoin(serviceTypes, and(eq(serviceTypes.shopId, serviceTransactions.shopId), eq(serviceTypes.id, serviceTransactions.serviceTypeId)))
    .leftJoin(customers, and(eq(customers.shopId, serviceTransactions.shopId), eq(customers.id, serviceTransactions.customerId)))
    .leftJoin(financialAccounts, and(eq(financialAccounts.shopId, serviceTransactions.shopId), eq(financialAccounts.id, serviceTransactions.providerAccountId)))
    .where(and(eq(serviceTransactions.shopId, shopId), eq(serviceTransactions.id, serviceId))).limit(1);
  if (!service) return null;
  const [candidateAccounts, paymentRows] = await Promise.all([
    db.select({ id: financialAccounts.id, name: financialAccounts.name, kind: financialAccounts.kind, provider: financialAccounts.provider, ledgerAccountId: ledgerAccounts.id })
      .from(financialAccounts).innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, financialAccounts.shopId), eq(ledgerAccounts.id, financialAccounts.ledgerAccountId)))
      .where(and(eq(financialAccounts.shopId, shopId), eq(financialAccounts.isActive, true), eq(ledgerAccounts.active, true), eq(ledgerAccounts.accountType, "ASSET"), eq(ledgerAccounts.normalBalance, "DEBIT"))).orderBy(asc(financialAccounts.name)),
    db.select({ id: servicePayments.id, accountId: servicePayments.financialAccountId, accountName: financialAccounts.name, amount: servicePayments.amount, paidAt: servicePayments.paidAt })
      .from(servicePayments).innerJoin(financialAccounts, and(eq(financialAccounts.shopId, servicePayments.shopId), eq(financialAccounts.id, servicePayments.financialAccountId)))
      .where(and(eq(servicePayments.shopId, shopId), eq(servicePayments.serviceTransactionId, serviceId))).orderBy(asc(servicePayments.paidAt), asc(servicePayments.id)),
  ]);
  const parentRows = candidateAccounts.length > 0
    ? await db.select({ parentId: ledgerAccounts.parentId }).from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, shopId), inArray(ledgerAccounts.parentId, candidateAccounts.map((account) => account.ledgerAccountId))))
    : [];
  const parents = new Set(parentRows.map((row) => row.parentId).filter((id): id is string => id !== null));
  const accounts = candidateAccounts.filter((account) => !parents.has(account.ledgerAccountId)).map(({ ledgerAccountId: _ledgerAccountId, ...account }) => account);
  const defaultServiceCashDrawerId = await getDefaultCashDrawerForShop(shopId, "SERVICES");
  return { service, accounts, paymentRows, defaultServiceCashDrawerId };
}

export async function createServiceTransactionForShop(input: {
  shopId: string; createdBy: string; serviceTypeId: string; customerId: string; principalAmount: string; serviceFee: string;
  providerAccountId: string; settlementAccountId: string; externalReference: string; notes: string;
}) {
  const serviceTypeId = parseUuid(input.serviceTypeId, "Service type")!;
  const customerId = parseUuid(input.customerId, "Customer", true);
  const providerAccountId = parseUuid(input.providerAccountId, "Provider account", true);
  const settlementAccountId = parseUuid(input.settlementAccountId, "Settlement account", true);
  const externalReference = input.externalReference.trim();
  const notes = input.notes.trim();
  if (externalReference.length > 150) throw new ShopServiceError("External reference must be 150 characters or fewer.");
  if (notes.length > 1000) throw new ShopServiceError("Notes must be 1,000 characters or fewer.");
  const principalCents = parseFormMoney(input.principalAmount, "Principal amount");
  const feeCents = parseFormMoney(input.serviceFee, "Service fee");
  const totalCents = principalCents + feeCents;
  if (totalCents <= 0 || !Number.isSafeInteger(totalCents)) throw new ShopServiceError("Principal plus service fee must be greater than zero and within the supported range.");
  if (totalCents > centsToNumber(MAX_MONEY.toFixed(2))) throw new ShopServiceError("Total service amount exceeds the supported maximum.");

  return db.transaction(async (tx) => {
    const type = await getSelectedActiveServiceType(tx, input.shopId, serviceTypeId);
    const direction = type.direction as ServiceDirection;
    if (direction === "NONE" && principalCents !== 0) throw new ShopServiceError("This service type does not move a provider principal. Set the principal amount to Rs 0.00 and record the charge as a service fee.");
    if (direction !== "NONE" && principalCents <= 0) throw new ShopServiceError("Principal amount must be greater than zero for provider money transfers.");
    if (customerId) {
      const [customer] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.shopId, input.shopId), eq(customers.id, customerId), eq(customers.active, true))).limit(1);
      if (!customer) throw new ShopServiceError("The selected customer is inactive or belongs to another shop.");
    }

    let providerAccount: Awaited<ReturnType<typeof getPostableFinancialAccount>> | null = null;
    let settlementAccount: Awaited<ReturnType<typeof getPostableFinancialAccount>> | null = null;
    if (direction !== "NONE") {
      if (!providerAccountId) throw new ShopServiceError("Select the exact provider wallet or bank account used for this service.");
      providerAccount = await getPostableFinancialAccount(tx, input.shopId, providerAccountId);
      if (type.category === "EASYPAISA" && providerAccount.provider.toUpperCase() !== "EASYPAISA") throw new ShopServiceError("Choose an Easypaisa financial account for this service type.");
      if (type.category === "JAZZCASH" && providerAccount.provider.toUpperCase() !== "JAZZCASH") throw new ShopServiceError("Choose a JazzCash financial account for this service type.");
      if (type.category === "BANK" && providerAccount.kind !== "BANK") throw new ShopServiceError("Choose a financial account configured as a Bank for this service type.");
      if (direction === "OUT" && !settlementAccountId) throw new ShopServiceError("Select the financial account that actually received the customer payment.");
      if (direction === "OUT" && settlementAccountId) settlementAccount = await getPostableFinancialAccount(tx, input.shopId, settlementAccountId);
      if (direction === "IN" && settlementAccountId) throw new ShopServiceError("For a provider-IN service, choose the cash/payout account when completing the service instead of on creation.");
    } else {
      if (providerAccountId) throw new ShopServiceError("A service with direction NONE must not select a provider wallet or bank account.");
      if (!settlementAccountId) throw new ShopServiceError("Select the financial account that received the customer service fee.");
      settlementAccount = await getPostableFinancialAccount(tx, input.shopId, settlementAccountId);
    }
    if (direction === "OUT" && providerAccount && settlementAccount && providerAccount.id === settlementAccount.id) {
      throw new ShopServiceError("Provider and customer payment accounts must be different for a provider-OUT service.");
    }

    const clearing = await getOrCreateServiceClearing(tx, input.shopId);
    const year = pakistanYear();
    const [{ lastValue }] = await tx.insert(documentSequences).values({ shopId: input.shopId, documentType: "SERVICE", year, lastValue: 1 })
      .onConflictDoUpdate({ target: [documentSequences.shopId, documentSequences.documentType, documentSequences.year], set: { lastValue: sql`${documentSequences.lastValue} + 1` } })
      .returning({ lastValue: documentSequences.lastValue });
    const documentNo = `SRV-${year}-${String(lastValue).padStart(6, "0")}`;
    const [service] = await tx.insert(serviceTransactions).values({
      shopId: input.shopId,
      documentNo,
      serviceTypeId,
      customerId,
      principalAmount: fromCents(principalCents),
      serviceFee: fromCents(feeCents),
      totalAmount: fromCents(totalCents),
      providerAccountId: providerAccount?.id ?? null,
      paymentStatus: "RECEIVED",
      serviceStatus: "PENDING",
      externalReference: externalReference || null,
      notes: notes || null,
      createdBy: input.createdBy,
    }).returning({ id: serviceTransactions.id, documentNo: serviceTransactions.documentNo });

    const initialAccount = direction === "IN" ? providerAccount! : settlementAccount!;
    const incomingLine: JournalLine[] = [
      { ledgerAccountId: initialAccount.ledgerAccountId, debitCents: totalCents, creditCents: 0, description: `Customer/provider funds received - ${documentNo}` },
      { ledgerAccountId: clearing.id, debitCents: 0, creditCents: totalCents, description: `Pending service amount held in clearing - ${documentNo}` },
    ];
    await postJournal(tx, { shopId: input.shopId, createdBy: input.createdBy, referenceType: "SERVICE_RECEIPT", referenceId: service.id, description: `Funds received for service ${documentNo}`, lines: incomingLine });
    await tx.insert(servicePayments).values({ shopId: input.shopId, serviceTransactionId: service.id, financialAccountId: initialAccount.id, amount: fromCents(totalCents), createdBy: input.createdBy });
    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.createdBy,
      action: "SERVICE_TRANSACTION_CREATED",
      entityType: "SERVICE_TRANSACTION",
      entityId: service.id,
      metadata: { documentNo, serviceTypeCode: type.code, serviceTypeName: type.name, direction, customerId, principalAmount: fromCents(principalCents), serviceFee: fromCents(feeCents), totalAmount: fromCents(totalCents), initialAccountId: initialAccount.id, initialAccountName: initialAccount.name },
    });
    return { id: service.id, documentNo, serviceStatus: "PENDING" as const, paymentStatus: "RECEIVED" as const };
  });
}

export async function transitionServiceTransactionForShop(input: {
  shopId: string; actorUserId: string; serviceId: string; action: "PROCESSING" | "COMPLETED" | ServiceFinalStatus;
  externalReference: string; accountId: string; reason: string;
}) {
  if (!UUID_PATTERN.test(input.serviceId)) throw new ShopServiceError("Service transaction reference is invalid.");
  const externalReference = input.externalReference.trim();
  const reason = input.reason.trim();
  const accountId = input.accountId.trim();
  if (externalReference.length > 150) throw new ShopServiceError("External reference must be 150 characters or fewer.");
  if (reason.length > 500) throw new ShopServiceError("Reason must be 500 characters or fewer.");
  if (accountId && !UUID_PATTERN.test(accountId)) throw new ShopServiceError("Selected financial account is invalid.");
  if ((input.action === "FAILED" || input.action === "CANCELLED") && reason.length < 2) throw new ShopServiceError("Enter a short reason for failing or cancelling this service.");

  return db.transaction(async (tx) => {
    const [record] = await tx.select({
      id: serviceTransactions.id, documentNo: serviceTransactions.documentNo, serviceTypeId: serviceTransactions.serviceTypeId,
      customerId: serviceTransactions.customerId, principalAmount: serviceTransactions.principalAmount, serviceFee: serviceTransactions.serviceFee,
      totalAmount: serviceTransactions.totalAmount, providerAccountId: serviceTransactions.providerAccountId, paymentStatus: serviceTransactions.paymentStatus,
      serviceStatus: serviceTransactions.serviceStatus, externalReference: serviceTransactions.externalReference,
    }).from(serviceTransactions).where(and(eq(serviceTransactions.shopId, input.shopId), eq(serviceTransactions.id, input.serviceId))).for("update").limit(1);
    if (!record) throw new ShopServiceError("Service transaction not found in this shop.");
    if (!(record.serviceStatus === "PENDING" || record.serviceStatus === "PROCESSING")) throw new ShopServiceError("Only pending or processing services can change status. Completed or refunded transactions are preserved as history.");
    const [type] = await tx.select({ id: serviceTypes.id, name: serviceTypes.name, direction: serviceTypes.providerMoneyDirection }).from(serviceTypes)
      .where(and(eq(serviceTypes.shopId, input.shopId), eq(serviceTypes.id, record.serviceTypeId))).limit(1);
    if (!type) throw new ShopServiceError("The service type for this transaction could not be found.");
    const direction = type.direction as ServiceDirection;
    const totalCents = moneyToCents(record.totalAmount, "Service total");
    const principalCents = moneyToCents(record.principalAmount, "Principal amount");
    const feeCents = moneyToCents(record.serviceFee, "Service fee");
    const clearing = await getLedgerAccountByCode(tx, input.shopId, "2200", "LIABILITY", "CREDIT");
    const [clearingBalanceRow] = await tx.select({ balance: sql<string>`COALESCE(SUM(${ledgerEntries.credit}::numeric - ${ledgerEntries.debit}::numeric), 0)::text` })
      .from(ledgerEntries).where(and(eq(ledgerEntries.shopId, input.shopId), eq(ledgerEntries.ledgerAccountId, clearing.id)));
    const clearingBalance = centsToNumber(clearingBalanceRow?.balance ?? "0.00");

    if (input.action === "PROCESSING") {
      const [updated] = await tx.update(serviceTransactions).set({ serviceStatus: "PROCESSING", updatedAt: new Date() })
        .where(and(eq(serviceTransactions.shopId, input.shopId), eq(serviceTransactions.id, record.id))).returning({ id: serviceTransactions.id });
      await tx.insert(auditLogs).values({ shopId: input.shopId, actorUserId: input.actorUserId, action: "SERVICE_TRANSACTION_PROCESSING", entityType: "SERVICE_TRANSACTION", entityId: updated.id, metadata: { documentNo: record.documentNo } });
      return { id: record.id, documentNo: record.documentNo, serviceStatus: "PROCESSING" as const };
    }

    if (input.action === "COMPLETED") {
      if (clearingBalance < totalCents) throw new ShopServiceError("Service clearing has insufficient credit balance for this pending transaction. Investigate the ledger before completing it.");
      const revenue = await getLedgerAccountByCode(tx, input.shopId, "4100", "REVENUE", "CREDIT");
      let payoutAccount: Awaited<ReturnType<typeof getPostableFinancialAccount>> | null = null;
      let providerAccount: Awaited<ReturnType<typeof getPostableFinancialAccount>> | null = null;
      if (direction === "OUT") {
        if (!record.providerAccountId) throw new ShopServiceError("This provider-OUT service is missing its provider account.");
        providerAccount = await getPostableFinancialAccount(tx, input.shopId, record.providerAccountId);
        if (await accountBalanceCents(tx, input.shopId, providerAccount.ledgerAccountId) < principalCents) throw new ShopServiceError(`${providerAccount.name} has insufficient recorded balance to complete this provider payment.`);
      } else if (direction === "IN") {
        if (!accountId) throw new ShopServiceError("Select the account that will pay the principal to the customer.");
        payoutAccount = await getPostableFinancialAccount(tx, input.shopId, accountId);
        if (payoutAccount.id === record.providerAccountId) throw new ShopServiceError("The provider receiving account and customer payout account must be different.");
        if (await accountBalanceCents(tx, input.shopId, payoutAccount.ledgerAccountId) < principalCents) throw new ShopServiceError(`${payoutAccount.name} has insufficient recorded balance to pay the customer.`);
      }
      const lines: JournalLine[] = [
        { ledgerAccountId: clearing.id, debitCents: totalCents, creditCents: 0, description: `Release pending service amount - ${record.documentNo}` },
      ];
      if (direction === "OUT" && providerAccount && principalCents > 0) lines.push({ ledgerAccountId: providerAccount.ledgerAccountId, debitCents: 0, creditCents: principalCents, description: `Provider account outflow - ${record.documentNo}` });
      if (direction === "IN" && payoutAccount && principalCents > 0) lines.push({ ledgerAccountId: payoutAccount.ledgerAccountId, debitCents: 0, creditCents: principalCents, description: `Customer principal payout - ${record.documentNo}` });
      if (feeCents > 0) lines.push({ ledgerAccountId: revenue.id, debitCents: 0, creditCents: feeCents, description: `Service fee revenue - ${record.documentNo}` });
      await postJournal(tx, { shopId: input.shopId, createdBy: input.actorUserId, referenceType: "SERVICE_COMPLETION", referenceId: record.id, description: `Service completed: ${record.documentNo}`, lines });
      if (direction === "OUT" && providerAccount && principalCents > 0) {
        await tx.insert(servicePayments).values({ shopId: input.shopId, serviceTransactionId: record.id, financialAccountId: providerAccount.id, amount: fromCents(principalCents), createdBy: input.actorUserId });
      }
      if (direction === "IN" && payoutAccount && principalCents > 0) {
        await tx.insert(servicePayments).values({ shopId: input.shopId, serviceTransactionId: record.id, financialAccountId: payoutAccount.id, amount: fromCents(principalCents), createdBy: input.actorUserId });
      }
      const [updated] = await tx.update(serviceTransactions).set({ serviceStatus: "COMPLETED", paymentStatus: "RECEIVED", externalReference: externalReference || record.externalReference, completedBy: input.actorUserId, completedAt: new Date(), updatedAt: new Date(), failureReason: null })
        .where(and(eq(serviceTransactions.shopId, input.shopId), eq(serviceTransactions.id, record.id))).returning({ id: serviceTransactions.id });
      await tx.insert(auditLogs).values({ shopId: input.shopId, actorUserId: input.actorUserId, action: "SERVICE_TRANSACTION_COMPLETED", entityType: "SERVICE_TRANSACTION", entityId: updated.id, metadata: { documentNo: record.documentNo, direction, principalAmount: fromCents(principalCents), serviceFee: fromCents(feeCents), totalAmount: fromCents(totalCents), externalReference: externalReference || record.externalReference, settlementAccountId: direction === "IN" ? payoutAccount?.id ?? null : null } });
      return { id: record.id, documentNo: record.documentNo, serviceStatus: "COMPLETED" as const };
    }

    // A pending service can only be cancelled/failed by refunding the received funds.
    if (record.paymentStatus !== "RECEIVED") throw new ShopServiceError("This service is not in a received-payment state and cannot be refunded through this action.");
    if (clearingBalance < totalCents) throw new ShopServiceError("Service clearing has insufficient balance for this refund. Investigate the ledger before proceeding.");
    let refundAccount: Awaited<ReturnType<typeof getPostableFinancialAccount>> | null = null;
    if (direction === "IN") {
      if (!record.providerAccountId) throw new ShopServiceError("The provider account needed to return incoming funds is missing.");
      refundAccount = await getPostableFinancialAccount(tx, input.shopId, record.providerAccountId);
    } else {
      if (!accountId) throw new ShopServiceError("Select the actual financial account from which the customer refund will be paid.");
      refundAccount = await getPostableFinancialAccount(tx, input.shopId, accountId);
    }
    if (await accountBalanceCents(tx, input.shopId, refundAccount.ledgerAccountId) < totalCents) throw new ShopServiceError(`${refundAccount.name} has insufficient recorded balance for the full service refund.`);
    await postJournal(tx, { shopId: input.shopId, createdBy: input.actorUserId, referenceType: "SERVICE_REFUND", referenceId: record.id, description: `Refund pending service: ${record.documentNo}`, lines: [
      { ledgerAccountId: clearing.id, debitCents: totalCents, creditCents: 0, description: `Release clearing for refunded service - ${record.documentNo}` },
      { ledgerAccountId: refundAccount.ledgerAccountId, debitCents: 0, creditCents: totalCents, description: `Service refund from ${refundAccount.name} - ${record.documentNo}` },
    ] });
    await tx.insert(servicePayments).values({ shopId: input.shopId, serviceTransactionId: record.id, financialAccountId: refundAccount.id, amount: fromCents(totalCents), createdBy: input.actorUserId });
    const nextStatus = input.action as ServiceFinalStatus;
    const [updated] = await tx.update(serviceTransactions).set({ serviceStatus: nextStatus, paymentStatus: "REFUNDED", failureReason: reason, updatedAt: new Date() })
      .where(and(eq(serviceTransactions.shopId, input.shopId), eq(serviceTransactions.id, record.id))).returning({ id: serviceTransactions.id });
    await tx.insert(auditLogs).values({ shopId: input.shopId, actorUserId: input.actorUserId, action: nextStatus === "FAILED" ? "SERVICE_TRANSACTION_FAILED_REFUNDED" : "SERVICE_TRANSACTION_CANCELLED_REFUNDED", entityType: "SERVICE_TRANSACTION", entityId: updated.id, metadata: { documentNo: record.documentNo, direction, refundAmount: fromCents(totalCents), refundAccountId: refundAccount.id, refundAccountName: refundAccount.name, reason } });
    return { id: record.id, documentNo: record.documentNo, serviceStatus: nextStatus, refundAmount: fromCents(totalCents), refundAccountName: refundAccount.name };
  });
}
