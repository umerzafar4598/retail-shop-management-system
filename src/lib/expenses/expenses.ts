import "server-only";

import Decimal from "decimal.js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { getDefaultCashDrawerForShop } from "@/lib/cash/cash-drawer-settings";
import {
  auditLogs,
  documentSequences,
  expenseCategories,
  expenses,
  financialAccounts,
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
} from "@/db/schema";

type ExpenseDbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;
const MAX_MONEY = new Decimal("999999999999.99");
const DEFAULT_CATEGORIES = [
  { code: "6000", name: "Electricity" },
  { code: "6010", name: "Internet" },
  { code: "6020", name: "Rent" },
  { code: "6030", name: "Salary" },
  { code: "6040", name: "Maintenance" },
  { code: "6050", name: "Miscellaneous" },
] as const;

export class ExpenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpenseError";
  }
}

function parseMoney(raw: string, label: string): { cents: number; formatted: string } {
  const normalized = raw.trim();
  if (!MONEY_PATTERN.test(normalized)) throw new ExpenseError(`${label} must be a positive amount with no more than two decimal places.`);
  const value = new Decimal(normalized);
  if (!value.isFinite() || !value.greaterThan(0) || value.greaterThan(MAX_MONEY)) {
    throw new ExpenseError(`${label} must be greater than zero and within the supported range.`);
  }
  const cents = value.mul(100).toNumber();
  if (!Number.isSafeInteger(cents)) throw new ExpenseError(`${label} is outside the supported range.`);
  return { cents, formatted: fromCents(cents) };
}

function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new ExpenseError("A calculated amount is outside the supported range.");
  return new Decimal(cents).div(100).toFixed(2);
}

function storedMoneyToCents(value: string | number | null | undefined): number {
  const cents = new Decimal(value ?? "0").mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (!Number.isSafeInteger(cents)) throw new ExpenseError("A ledger balance is outside the supported range.");
  return cents;
}

function parseUuid(value: string, label: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) throw new ExpenseError(`${label} is invalid. Refresh the page and try again.`);
  return normalized;
}

function pakistanToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validateExpenseDate(raw: string) {
  const date = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ExpenseError("Enter a valid expense date.");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new ExpenseError("Enter a valid expense date.");
  const year = Number(date.slice(0, 4));
  if (year < 2000) throw new ExpenseError("Expense dates before the year 2000 are not supported.");
  if (date > pakistanToday()) throw new ExpenseError("Expense date cannot be in the future.");
  return { date, year };
}

function cleanOptionalText(value: string, label: string, max = 1000): string | null {
  const normalized = value.trim();
  if (normalized.length > max) throw new ExpenseError(`${label} must be ${max} characters or fewer.`);
  return normalized || null;
}

async function getAccountBalanceCents(tx: ExpenseDbTx, shopId: string, ledgerAccountId: string) {
  const [row] = await tx.select({
    balance: sql<string>`COALESCE(SUM(${ledgerEntries.debit}::numeric - ${ledgerEntries.credit}::numeric), 0)::text`,
  }).from(ledgerEntries).where(and(eq(ledgerEntries.shopId, shopId), eq(ledgerEntries.ledgerAccountId, ledgerAccountId)));
  return storedMoneyToCents(row?.balance ?? "0.00");
}

async function ensureDefaultCategories(tx: ExpenseDbTx, shopId: string, actorUserId: string) {
  for (const defaultCategory of DEFAULT_CATEGORIES) {
    const [account] = await tx.select({
      id: ledgerAccounts.id,
      code: ledgerAccounts.code,
      name: ledgerAccounts.name,
      accountType: ledgerAccounts.accountType,
      normalBalance: ledgerAccounts.normalBalance,
      active: ledgerAccounts.active,
    }).from(ledgerAccounts).where(and(
      eq(ledgerAccounts.shopId, shopId),
      eq(ledgerAccounts.code, defaultCategory.code),
    )).limit(1);
    if (!account || !account.active || account.accountType !== "EXPENSE" || account.normalBalance !== "DEBIT") continue;
    const [child] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, shopId), eq(ledgerAccounts.parentId, account.id))).limit(1);
    if (child) continue;
    const [created] = await tx.insert(expenseCategories).values({
      shopId,
      ledgerAccountId: account.id,
      name: defaultCategory.name,
      active: true,
    }).onConflictDoNothing({ target: [expenseCategories.shopId, expenseCategories.name] }).returning({ id: expenseCategories.id });
    if (created) {
      await tx.insert(auditLogs).values({
        shopId,
        actorUserId,
        action: "EXPENSE_CATEGORY_CREATED",
        entityType: "EXPENSE_CATEGORY",
        entityId: created.id,
        metadata: { name: defaultCategory.name, ledgerAccountId: account.id, ledgerCode: account.code, seededDefault: true },
      });
    }
  }
}

export async function ensureDefaultExpenseCategoriesForShop(shopId: string, actorUserId: string) {
  await db.transaction(async (tx) => ensureDefaultCategories(tx, shopId, actorUserId));
}

export async function getExpenseCategorySettingsForShop(shopId: string, actorUserId: string) {
  await ensureDefaultExpenseCategoriesForShop(shopId, actorUserId);
  const [categories, ledgerOptions, childRows] = await Promise.all([
    db.select({
      id: expenseCategories.id,
      name: expenseCategories.name,
      active: expenseCategories.active,
      ledgerAccountId: ledgerAccounts.id,
      ledgerCode: ledgerAccounts.code,
      ledgerName: ledgerAccounts.name,
      ledgerAccountActive: ledgerAccounts.active,
    }).from(expenseCategories)
      .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, expenseCategories.shopId), eq(ledgerAccounts.id, expenseCategories.ledgerAccountId)))
      .where(eq(expenseCategories.shopId, shopId))
      .orderBy(asc(expenseCategories.name)),
    db.select({ id: ledgerAccounts.id, code: ledgerAccounts.code, name: ledgerAccounts.name })
      .from(ledgerAccounts).where(and(
        eq(ledgerAccounts.shopId, shopId),
        eq(ledgerAccounts.active, true),
        eq(ledgerAccounts.accountType, "EXPENSE"),
        eq(ledgerAccounts.normalBalance, "DEBIT"),
      )).orderBy(asc(ledgerAccounts.code)),
    db.select({ parentId: ledgerAccounts.parentId }).from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, shopId), sql`${ledgerAccounts.parentId} IS NOT NULL`)),
  ]);
  const parentIds = new Set(childRows.map((row) => row.parentId).filter((id): id is string => Boolean(id)));
  return {
    categories,
    ledgerOptions: ledgerOptions.filter((account) => !parentIds.has(account.id)),
  };
}

export async function createExpenseCategoryForShop(input: {
  shopId: string;
  actorUserId: string;
  name: string;
  ledgerAccountId: string;
}) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) throw new ExpenseError("Category name must be between 2 and 100 characters.");
  const ledgerAccountId = parseUuid(input.ledgerAccountId, "Expense ledger account");
  await db.transaction(async (tx) => {
    const [account] = await tx.select({
      id: ledgerAccounts.id,
      code: ledgerAccounts.code,
      name: ledgerAccounts.name,
      accountType: ledgerAccounts.accountType,
      normalBalance: ledgerAccounts.normalBalance,
      active: ledgerAccounts.active,
    }).from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, input.shopId), eq(ledgerAccounts.id, ledgerAccountId))).for("update").limit(1);
    if (!account || !account.active || account.accountType !== "EXPENSE" || account.normalBalance !== "DEBIT") {
      throw new ExpenseError("Choose an active debit-normal expense ledger account for this category.");
    }
    const [child] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, input.shopId), eq(ledgerAccounts.parentId, account.id))).limit(1);
    if (child) throw new ExpenseError("Choose a leaf expense ledger account instead of a parent account.");
    const [existing] = await tx.select({ id: expenseCategories.id }).from(expenseCategories)
      .where(and(eq(expenseCategories.shopId, input.shopId), eq(expenseCategories.name, name))).limit(1);
    if (existing) throw new ExpenseError("An expense category with that name already exists in this shop.");
    const [category] = await tx.insert(expenseCategories).values({
      shopId: input.shopId,
      ledgerAccountId: account.id,
      name,
      active: true,
    }).returning({ id: expenseCategories.id });
    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.actorUserId,
      action: "EXPENSE_CATEGORY_CREATED",
      entityType: "EXPENSE_CATEGORY",
      entityId: category.id,
      metadata: { name, ledgerAccountId: account.id, ledgerCode: account.code, ledgerName: account.name, seededDefault: false },
    });
  });
}

export async function setExpenseCategoryActiveForShop(input: {
  shopId: string;
  actorUserId: string;
  categoryId: string;
  active: boolean;
}) {
  const categoryId = parseUuid(input.categoryId, "Expense category");
  await db.transaction(async (tx) => {
    const [category] = await tx.select({ id: expenseCategories.id, name: expenseCategories.name, active: expenseCategories.active })
      .from(expenseCategories).where(and(eq(expenseCategories.shopId, input.shopId), eq(expenseCategories.id, categoryId))).for("update").limit(1);
    if (!category) throw new ExpenseError("Expense category not found for this shop.");
    if (category.active === input.active) return;
    await tx.update(expenseCategories).set({ active: input.active })
      .where(and(eq(expenseCategories.shopId, input.shopId), eq(expenseCategories.id, categoryId)));
    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.actorUserId,
      action: input.active ? "EXPENSE_CATEGORY_REACTIVATED" : "EXPENSE_CATEGORY_DEACTIVATED",
      entityType: "EXPENSE_CATEGORY",
      entityId: category.id,
      metadata: { name: category.name, previousActive: category.active, active: input.active },
    });
  });
}

export async function getExpensePageData(shopId: string) {
  const [categories, accountRows, childRows, recentExpenses, monthTotalRows] = await Promise.all([
    db.select({ id: expenseCategories.id, name: expenseCategories.name, ledgerAccountId: ledgerAccounts.id, ledgerCode: ledgerAccounts.code, ledgerName: ledgerAccounts.name })
      .from(expenseCategories).innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, expenseCategories.shopId), eq(ledgerAccounts.id, expenseCategories.ledgerAccountId)))
      .where(and(eq(expenseCategories.shopId, shopId), eq(expenseCategories.active, true), eq(ledgerAccounts.active, true)))
      .orderBy(asc(expenseCategories.name)),
    db.select({ id: financialAccounts.id, name: financialAccounts.name, kind: financialAccounts.kind, ledgerAccountId: ledgerAccounts.id, ledgerName: ledgerAccounts.name })
      .from(financialAccounts).innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, financialAccounts.shopId), eq(ledgerAccounts.id, financialAccounts.ledgerAccountId)))
      .where(and(eq(financialAccounts.shopId, shopId), eq(financialAccounts.isActive, true), eq(ledgerAccounts.active, true), eq(ledgerAccounts.accountType, "ASSET"), eq(ledgerAccounts.normalBalance, "DEBIT")))
      .orderBy(asc(financialAccounts.name)),
    db.select({ parentId: ledgerAccounts.parentId }).from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, shopId), sql`${ledgerAccounts.parentId} IS NOT NULL`)),
    db.select({
      id: expenses.id,
      documentNo: expenses.documentNo,
      amount: expenses.amount,
      expenseDate: expenses.expenseDate,
      payee: expenses.payee,
      notes: expenses.notes,
      status: expenses.status,
      createdAt: expenses.createdAt,
      categoryName: expenseCategories.name,
      accountName: financialAccounts.name,
    }).from(expenses)
      .innerJoin(expenseCategories, and(eq(expenseCategories.shopId, expenses.shopId), eq(expenseCategories.id, expenses.categoryId)))
      .innerJoin(financialAccounts, and(eq(financialAccounts.shopId, expenses.shopId), eq(financialAccounts.id, expenses.financialAccountId)))
      .where(eq(expenses.shopId, shopId)).orderBy(desc(expenses.createdAt)).limit(50),
    db.select({ total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text` }).from(expenses)
      .where(and(eq(expenses.shopId, shopId), eq(expenses.status, "POSTED"), sql`${expenses.expenseDate} >= to_char((now() AT TIME ZONE 'Asia/Karachi')::date, 'YYYY-MM-01')::date`)),
  ]);
  const parentIds = new Set(childRows.map((row) => row.parentId).filter((id): id is string => Boolean(id)));
  const accounts = accountRows.filter((account) => !parentIds.has(account.ledgerAccountId));
  const defaultRetailCashDrawerId = await getDefaultCashDrawerForShop(shopId, "RETAIL");
  return { categories, accounts, recentExpenses, monthTotal: monthTotalRows[0]?.total ?? "0.00", defaultRetailCashDrawerId };
}

export async function createExpenseForShop(input: {
  shopId: string;
  createdBy: string;
  categoryId: string;
  financialAccountId: string;
  amount: string;
  expenseDate: string;
  payee: string;
  notes: string;
}) {
  const categoryId = parseUuid(input.categoryId, "Expense category");
  const financialAccountId = parseUuid(input.financialAccountId, "Payment account");
  const amount = parseMoney(input.amount, "Expense amount");
  const { date, year } = validateExpenseDate(input.expenseDate);
  const payee = cleanOptionalText(input.payee, "Payee", 200);
  const notes = cleanOptionalText(input.notes, "Notes", 2000);

  return db.transaction(async (tx) => {
    const [category] = await tx.select({
      id: expenseCategories.id,
      name: expenseCategories.name,
      active: expenseCategories.active,
      ledgerAccountId: ledgerAccounts.id,
      ledgerCode: ledgerAccounts.code,
      ledgerName: ledgerAccounts.name,
      ledgerAccountActive: ledgerAccounts.active,
      ledgerAccountType: ledgerAccounts.accountType,
      ledgerNormalBalance: ledgerAccounts.normalBalance,
    }).from(expenseCategories)
      .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, expenseCategories.shopId), eq(ledgerAccounts.id, expenseCategories.ledgerAccountId)))
      .where(and(eq(expenseCategories.shopId, input.shopId), eq(expenseCategories.id, categoryId))).for("update").limit(1);
    if (!category || !category.active || !category.ledgerAccountActive || category.ledgerAccountType !== "EXPENSE" || category.ledgerNormalBalance !== "DEBIT") {
      throw new ExpenseError("The selected expense category is inactive or incorrectly mapped to its ledger account.");
    }
    const [categoryChild] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, input.shopId), eq(ledgerAccounts.parentId, category.ledgerAccountId))).limit(1);
    if (categoryChild) throw new ExpenseError("The category ledger account is a parent account and cannot receive direct postings.");

    const [account] = await tx.select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      kind: financialAccounts.kind,
      ledgerAccountId: ledgerAccounts.id,
      ledgerName: ledgerAccounts.name,
      ledgerAccountType: ledgerAccounts.accountType,
      ledgerNormalBalance: ledgerAccounts.normalBalance,
      ledgerActive: ledgerAccounts.active,
    }).from(financialAccounts)
      .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, financialAccounts.shopId), eq(ledgerAccounts.id, financialAccounts.ledgerAccountId)))
      .where(and(eq(financialAccounts.shopId, input.shopId), eq(financialAccounts.id, financialAccountId), eq(financialAccounts.isActive, true), eq(ledgerAccounts.active, true))).for("update").limit(1);
    if (!account || account.ledgerAccountType !== "ASSET" || account.ledgerNormalBalance !== "DEBIT") {
      throw new ExpenseError("Choose an active financial asset account with debit normal balance.");
    }
    const [accountChild] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, input.shopId), eq(ledgerAccounts.parentId, account.ledgerAccountId))).limit(1);
    if (accountChild) throw new ExpenseError(`Choose a specific financial account instead of parent account ${account.ledgerName}.`);
    const balanceCents = await getAccountBalanceCents(tx, input.shopId, account.ledgerAccountId);
    if (balanceCents < amount.cents) {
      throw new ExpenseError(`${account.name} has only Rs ${fromCents(Math.max(0, balanceCents))} available in the recorded ledger balance; the expense is Rs ${amount.formatted}.`);
    }

    const [sequence] = await tx.insert(documentSequences).values({ shopId: input.shopId, documentType: "EXPENSE", year, lastValue: 1 })
      .onConflictDoUpdate({
        target: [documentSequences.shopId, documentSequences.documentType, documentSequences.year],
        set: { lastValue: sql`${documentSequences.lastValue} + 1` },
      }).returning({ lastValue: documentSequences.lastValue });
    const documentNo = `EXP-${year}-${String(sequence.lastValue).padStart(6, "0")}`;
    const [expense] = await tx.insert(expenses).values({
      shopId: input.shopId,
      documentNo,
      categoryId: category.id,
      financialAccountId: account.id,
      amount: amount.formatted,
      expenseDate: date,
      payee,
      notes,
      status: "POSTED",
      createdBy: input.createdBy,
    }).returning({ id: expenses.id, documentNo: expenses.documentNo });
    const [journal] = await tx.insert(ledgerTransactions).values({
      shopId: input.shopId,
      referenceType: "EXPENSE",
      referenceId: expense.id,
      description: `Expense ${documentNo}: ${category.name}`,
      createdBy: input.createdBy,
      occurredAt: new Date(`${date}T12:00:00.000Z`),
    }).returning({ id: ledgerTransactions.id });
    await tx.insert(ledgerEntries).values([
      {
        shopId: input.shopId,
        ledgerTransactionId: journal.id,
        ledgerAccountId: category.ledgerAccountId,
        debit: amount.formatted,
        credit: "0.00",
        description: `${category.name} expense - ${documentNo}`,
      },
      {
        shopId: input.shopId,
        ledgerTransactionId: journal.id,
        ledgerAccountId: account.ledgerAccountId,
        debit: "0.00",
        credit: amount.formatted,
        description: `Paid from ${account.name} - ${documentNo}`,
      },
    ]);
    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.createdBy,
      action: "EXPENSE_POSTED",
      entityType: "EXPENSE",
      entityId: expense.id,
      metadata: {
        documentNo,
        categoryId: category.id,
        categoryName: category.name,
        expenseLedgerAccountId: category.ledgerAccountId,
        financialAccountId: account.id,
        financialAccountName: account.name,
        amount: amount.formatted,
        expenseDate: date,
        payee,
      },
    });
    return { id: expense.id, documentNo, amount: amount.formatted, categoryName: category.name, financialAccountName: account.name };
  });
}

export async function getExpenseForReversalPageData(shopId: string, expenseIdRaw: string) {
  const expenseId = parseUuid(expenseIdRaw, "Expense");
  const [expense] = await db.select({
    id: expenses.id,
    documentNo: expenses.documentNo,
    categoryId: expenses.categoryId,
    categoryName: expenseCategories.name,
    financialAccountId: expenses.financialAccountId,
    accountName: financialAccounts.name,
    amount: expenses.amount,
    expenseDate: expenses.expenseDate,
    payee: expenses.payee,
    notes: expenses.notes,
    status: expenses.status,
    createdAt: expenses.createdAt,
  }).from(expenses)
    .innerJoin(expenseCategories, and(eq(expenseCategories.shopId, expenses.shopId), eq(expenseCategories.id, expenses.categoryId)))
    .innerJoin(financialAccounts, and(eq(financialAccounts.shopId, expenses.shopId), eq(financialAccounts.id, expenses.financialAccountId)))
    .where(and(eq(expenses.shopId, shopId), eq(expenses.id, expenseId))).limit(1);
  if (!expense) return null;

  const [reversalAudit] = await db.select({ metadata: auditLogs.metadata, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(and(eq(auditLogs.shopId, shopId), eq(auditLogs.entityType, "EXPENSE"), eq(auditLogs.entityId, expense.id), eq(auditLogs.action, "EXPENSE_REVERSED")))
    .orderBy(desc(auditLogs.createdAt)).limit(1);
  const metadata = reversalAudit?.metadata && typeof reversalAudit.metadata === "object"
    ? reversalAudit.metadata as Record<string, unknown>
    : null;
  return {
    expense,
    reversal: metadata ? {
      reason: typeof metadata.reason === "string" ? metadata.reason : null,
      reversalDocumentNo: typeof metadata.reversalDocumentNo === "string" ? metadata.reversalDocumentNo : null,
      replacementDocumentNo: typeof metadata.replacementDocumentNo === "string" ? metadata.replacementDocumentNo : null,
      replacementAdvice: typeof metadata.replacementAdvice === "string" ? metadata.replacementAdvice : null,
      reversedAt: reversalAudit?.createdAt ?? null,
    } : null,
  };
}

export async function reverseExpenseForShop(input: {
  shopId: string;
  actorUserId: string;
  expenseId: string;
  reason: string;
  replacement?: {
    categoryId: string;
    financialAccountId: string;
    amount: string;
    expenseDate: string;
    payee: string;
    notes: string;
  };
}) {
  const expenseId = parseUuid(input.expenseId, "Expense");
  const reason = cleanOptionalText(input.reason, "Reversal reason", 1000);
  if (!reason || reason.length < 5) throw new ExpenseError("Provide a reversal reason between 5 and 1,000 characters.");

  const replacement = input.replacement ? {
    categoryId: parseUuid(input.replacement.categoryId, "Replacement expense category"),
    financialAccountId: parseUuid(input.replacement.financialAccountId, "Replacement payment account"),
    amount: parseMoney(input.replacement.amount, "Replacement expense amount"),
    ...validateExpenseDate(input.replacement.expenseDate),
    payee: cleanOptionalText(input.replacement.payee, "Replacement payee", 200),
    notes: cleanOptionalText(input.replacement.notes, "Replacement notes", 2000),
  } : null;
  const reversalYear = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", year: "numeric" }).format(new Date()));

  return db.transaction(async (tx) => {
    const [expense] = await tx.select({
      id: expenses.id,
      documentNo: expenses.documentNo,
      categoryId: expenses.categoryId,
      financialAccountId: expenses.financialAccountId,
      amount: expenses.amount,
      status: expenses.status,
    }).from(expenses).where(and(eq(expenses.shopId, input.shopId), eq(expenses.id, expenseId))).for("update").limit(1);
    if (!expense) throw new ExpenseError("Expense not found for this shop.");
    if (expense.status !== "POSTED") throw new ExpenseError("Only a posted expense can be reversed. This expense may already have been reversed.");

    const [originalJournal] = await tx.select({ id: ledgerTransactions.id })
      .from(ledgerTransactions)
      .where(and(
        eq(ledgerTransactions.shopId, input.shopId),
        eq(ledgerTransactions.referenceType, "EXPENSE"),
        eq(ledgerTransactions.referenceId, expense.id),
      )).for("update").limit(1);
    if (!originalJournal) throw new ExpenseError("The original expense journal could not be found; no reversal was posted.");

    const [existingReversal] = await tx.select({ id: ledgerTransactions.id })
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.shopId, input.shopId), eq(ledgerTransactions.reversalOfId, originalJournal.id))).limit(1);
    if (existingReversal) throw new ExpenseError("A reversal journal already exists for this expense.");

    const originalLines = await tx.select({
      ledgerAccountId: ledgerEntries.ledgerAccountId,
      debit: ledgerEntries.debit,
      credit: ledgerEntries.credit,
      description: ledgerEntries.description,
    }).from(ledgerEntries).where(and(
      eq(ledgerEntries.shopId, input.shopId),
      eq(ledgerEntries.ledgerTransactionId, originalJournal.id),
    )).orderBy(asc(ledgerEntries.createdAt)).for("update");

    const debitCents = originalLines.reduce((sum, line) => sum + storedMoneyToCents(line.debit), 0);
    const creditCents = originalLines.reduce((sum, line) => sum + storedMoneyToCents(line.credit), 0);
    const expenseCents = storedMoneyToCents(expense.amount);
    if (originalLines.length < 2 || debitCents !== creditCents || debitCents !== expenseCents) {
      throw new ExpenseError("The original expense journal does not match its expense amount. No reversal was posted; investigate the ledger first.");
    }

    const [sequence] = await tx.insert(documentSequences).values({
      shopId: input.shopId,
      documentType: "EXPENSE_REVERSAL",
      year: reversalYear,
      lastValue: 1,
    }).onConflictDoUpdate({
      target: [documentSequences.shopId, documentSequences.documentType, documentSequences.year],
      set: { lastValue: sql`${documentSequences.lastValue} + 1` },
    }).returning({ lastValue: documentSequences.lastValue });
    const reversalDocumentNo = `EXR-${reversalYear}-${String(sequence.lastValue).padStart(6, "0")}`;

    const [reversalJournal] = await tx.insert(ledgerTransactions).values({
      shopId: input.shopId,
      referenceType: "EXPENSE_REVERSAL",
      referenceId: expense.id,
      description: `${reversalDocumentNo}: reverse ${expense.documentNo}`,
      createdBy: input.actorUserId,
      occurredAt: new Date(),
      reversalOfId: originalJournal.id,
    }).returning({ id: ledgerTransactions.id });

    await tx.insert(ledgerEntries).values(originalLines.map((line) => ({
      shopId: input.shopId,
      ledgerTransactionId: reversalJournal.id,
      ledgerAccountId: line.ledgerAccountId,
      debit: line.credit,
      credit: line.debit,
      description: `${reversalDocumentNo} reversal of ${expense.documentNo}${line.description ? ` — ${line.description}` : ""}`,
    })));

    await tx.update(expenses).set({ status: "VOIDED", updatedAt: new Date() })
      .where(and(eq(expenses.shopId, input.shopId), eq(expenses.id, expense.id), eq(expenses.status, "POSTED")));

    let replacementDocumentNo: string | null = null;
    if (replacement) {
      const [category] = await tx.select({
        id: expenseCategories.id,
        name: expenseCategories.name,
        active: expenseCategories.active,
        ledgerAccountId: ledgerAccounts.id,
        ledgerCode: ledgerAccounts.code,
        ledgerName: ledgerAccounts.name,
        ledgerAccountActive: ledgerAccounts.active,
        ledgerAccountType: ledgerAccounts.accountType,
        ledgerNormalBalance: ledgerAccounts.normalBalance,
      }).from(expenseCategories)
        .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, expenseCategories.shopId), eq(ledgerAccounts.id, expenseCategories.ledgerAccountId)))
        .where(and(eq(expenseCategories.shopId, input.shopId), eq(expenseCategories.id, replacement.categoryId))).for("update").limit(1);
      if (!category || !category.active || !category.ledgerAccountActive || category.ledgerAccountType !== "EXPENSE" || category.ledgerNormalBalance !== "DEBIT") {
        throw new ExpenseError("The replacement expense category is inactive or incorrectly mapped to its ledger account. The whole correction was rolled back.");
      }
      const [categoryChild] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
        .where(and(eq(ledgerAccounts.shopId, input.shopId), eq(ledgerAccounts.parentId, category.ledgerAccountId))).limit(1);
      if (categoryChild) throw new ExpenseError("The replacement category maps to a parent account and cannot receive direct postings.");

      const [account] = await tx.select({
        id: financialAccounts.id,
        name: financialAccounts.name,
        ledgerAccountId: ledgerAccounts.id,
        ledgerName: ledgerAccounts.name,
        ledgerAccountType: ledgerAccounts.accountType,
        ledgerNormalBalance: ledgerAccounts.normalBalance,
        ledgerActive: ledgerAccounts.active,
      }).from(financialAccounts)
        .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, financialAccounts.shopId), eq(ledgerAccounts.id, financialAccounts.ledgerAccountId)))
        .where(and(eq(financialAccounts.shopId, input.shopId), eq(financialAccounts.id, replacement.financialAccountId), eq(financialAccounts.isActive, true), eq(ledgerAccounts.active, true))).for("update").limit(1);
      if (!account || account.ledgerAccountType !== "ASSET" || account.ledgerNormalBalance !== "DEBIT") {
        throw new ExpenseError("Choose an active financial asset account for the replacement expense. The whole correction was rolled back.");
      }
      const [accountChild] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
        .where(and(eq(ledgerAccounts.shopId, input.shopId), eq(ledgerAccounts.parentId, account.ledgerAccountId))).limit(1);
      if (accountChild) throw new ExpenseError(`Choose a specific financial account instead of parent account ${account.ledgerName}.`);
      const balanceCents = await getAccountBalanceCents(tx, input.shopId, account.ledgerAccountId);
      if (balanceCents < replacement.amount.cents) {
        throw new ExpenseError(`${account.name} has only Rs ${fromCents(Math.max(0, balanceCents))} available after the reversal; the corrected expense is Rs ${replacement.amount.formatted}. The whole correction was rolled back.`);
      }

      const [replacementSequence] = await tx.insert(documentSequences).values({ shopId: input.shopId, documentType: "EXPENSE", year: replacement.year, lastValue: 1 })
        .onConflictDoUpdate({
          target: [documentSequences.shopId, documentSequences.documentType, documentSequences.year],
          set: { lastValue: sql`${documentSequences.lastValue} + 1` },
        }).returning({ lastValue: documentSequences.lastValue });
      replacementDocumentNo = `EXP-${replacement.year}-${String(replacementSequence.lastValue).padStart(6, "0")}`;
      const correctionNote = `Corrected replacement for ${expense.documentNo}${replacement.notes ? `: ${replacement.notes}` : ""}`;
      const [replacementExpense] = await tx.insert(expenses).values({
        shopId: input.shopId,
        documentNo: replacementDocumentNo,
        categoryId: category.id,
        financialAccountId: account.id,
        amount: replacement.amount.formatted,
        expenseDate: replacement.date,
        payee: replacement.payee,
        notes: correctionNote,
        status: "POSTED",
        createdBy: input.actorUserId,
      }).returning({ id: expenses.id, documentNo: expenses.documentNo });
      const [replacementJournal] = await tx.insert(ledgerTransactions).values({
        shopId: input.shopId,
        referenceType: "EXPENSE",
        referenceId: replacementExpense.id,
        description: `Corrected expense ${replacementDocumentNo} replacing ${expense.documentNo}: ${category.name}`,
        createdBy: input.actorUserId,
        occurredAt: new Date(`${replacement.date}T12:00:00.000Z`),
      }).returning({ id: ledgerTransactions.id });
      await tx.insert(ledgerEntries).values([
        {
          shopId: input.shopId,
          ledgerTransactionId: replacementJournal.id,
          ledgerAccountId: category.ledgerAccountId,
          debit: replacement.amount.formatted,
          credit: "0.00",
          description: `${category.name} corrected expense - ${replacementDocumentNo}`,
        },
        {
          shopId: input.shopId,
          ledgerTransactionId: replacementJournal.id,
          ledgerAccountId: account.ledgerAccountId,
          debit: "0.00",
          credit: replacement.amount.formatted,
          description: `Paid from ${account.name} - ${replacementDocumentNo}`,
        },
      ]);
      await tx.insert(auditLogs).values({
        shopId: input.shopId,
        actorUserId: input.actorUserId,
        action: "EXPENSE_POSTED",
        entityType: "EXPENSE",
        entityId: replacementExpense.id,
        metadata: {
          documentNo: replacementDocumentNo,
          replacesDocumentNo: expense.documentNo,
          reversedExpenseId: expense.id,
          categoryId: category.id,
          financialAccountId: account.id,
          financialAccountName: account.name,
          amount: replacement.amount.formatted,
          expenseDate: replacement.date,
          reason,
          correctedReplacement: true,
        },
      });
    }

    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.actorUserId,
      action: "EXPENSE_REVERSED",
      entityType: "EXPENSE",
      entityId: expense.id,
      metadata: {
        originalDocumentNo: expense.documentNo,
        originalExpenseId: expense.id,
        originalJournalId: originalJournal.id,
        reversalJournalId: reversalJournal.id,
        reversalDocumentNo,
        amount: expense.amount,
        reason,
        replacementDocumentNo,
        replacementAdvice: replacementDocumentNo
          ? `Corrected replacement posted as ${replacementDocumentNo}.`
          : `If a real expense still needs to be recorded, create a new expense and mention ${expense.documentNo} in its notes.`,
      },
    });
    return { id: expense.id, documentNo: expense.documentNo, reversalDocumentNo, replacementDocumentNo, amount: expense.amount };
  });
}
