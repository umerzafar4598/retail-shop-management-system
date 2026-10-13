import "server-only";

import Decimal from "decimal.js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  auditLogs,
  cashSessions,
  financialAccounts,
  ledgerAccounts,
  ledgerEntries,
} from "@/db/schema";

type CashDbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;
const MAX_MONEY = new Decimal("999999999999.99");

type MoneyParse = { cents: number; formatted: string };

export class CashSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashSessionError";
  }
}

function parseMoney(raw: string, label: string): MoneyParse {
  const value = raw.trim();
  if (!MONEY_PATTERN.test(value)) {
    throw new CashSessionError(`${label} must be a non-negative amount with up to two decimal places.`);
  }
  const decimal = new Decimal(value);
  if (!decimal.isFinite() || decimal.isNegative() || decimal.greaterThan(MAX_MONEY)) {
    throw new CashSessionError(`${label} is outside the supported range.`);
  }
  const cents = decimal.mul(100).toNumber();
  if (!Number.isSafeInteger(cents)) throw new CashSessionError(`${label} is outside the supported range.`);
  return { cents, formatted: fromCents(cents) };
}

function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new CashSessionError("A calculated money amount is outside the supported range.");
  }
  return new Decimal(cents).div(100).toFixed(2);
}

function fromSignedCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new CashSessionError("A calculated balance is outside the supported range.");
  return new Decimal(cents).div(100).toFixed(2);
}

function storedMoneyToCents(value: string | number | null | undefined): number {
  const amount = new Decimal(value ?? "0").mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (!Number.isSafeInteger(amount)) throw new CashSessionError("A ledger balance is outside the supported range.");
  return amount;
}

function parseUuid(value: string, label: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) throw new CashSessionError(`${label} is invalid. Refresh the page and try again.`);
  return normalized;
}

function pakistanYear(date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", year: "numeric" }).format(date));
}

async function getAccountBalanceCents(tx: CashDbTx, shopId: string, ledgerAccountId: string) {
  const [row] = await tx.select({
    balance: sql<string>`COALESCE(SUM(${ledgerEntries.debit}::numeric - ${ledgerEntries.credit}::numeric), 0)::text`,
  }).from(ledgerEntries).where(and(eq(ledgerEntries.shopId, shopId), eq(ledgerEntries.ledgerAccountId, ledgerAccountId)));
  return storedMoneyToCents(row?.balance ?? "0.00");
}

async function getCashAccountForUpdate(tx: CashDbTx, shopId: string, accountId: string) {
  const [account] = await tx.select({
    id: financialAccounts.id,
    name: financialAccounts.name,
    kind: financialAccounts.kind,
    ledgerAccountId: ledgerAccounts.id,
    ledgerCode: ledgerAccounts.code,
    ledgerName: ledgerAccounts.name,
    accountType: ledgerAccounts.accountType,
    normalBalance: ledgerAccounts.normalBalance,
    active: ledgerAccounts.active,
  }).from(financialAccounts)
    .innerJoin(ledgerAccounts, and(
      eq(ledgerAccounts.shopId, financialAccounts.shopId),
      eq(ledgerAccounts.id, financialAccounts.ledgerAccountId),
    ))
    .where(and(
      eq(financialAccounts.shopId, shopId),
      eq(financialAccounts.id, accountId),
      eq(financialAccounts.isActive, true),
      eq(ledgerAccounts.active, true),
    )).for("update").limit(1);

  if (!account) throw new CashSessionError("The selected cash account is missing, inactive, or belongs to another shop.");
  if (account.kind !== "CASH") throw new CashSessionError("Cash sessions can only be opened for financial accounts configured as CASH.");
  if (account.accountType !== "ASSET" || account.normalBalance !== "DEBIT") {
    throw new CashSessionError("The selected cash account must map to an active debit-normal asset ledger account.");
  }
  const [child] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.shopId, shopId), eq(ledgerAccounts.parentId, account.ledgerAccountId))).limit(1);
  if (child) throw new CashSessionError(`Select a specific cash drawer instead of parent account ${account.ledgerName}.`);
  return account;
}

export async function getCashSessionPageData(shopId: string) {
  const [accounts, sessions, childRows] = await Promise.all([
    db.select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      ledgerAccountId: ledgerAccounts.id,
    }).from(financialAccounts)
      .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, financialAccounts.shopId), eq(ledgerAccounts.id, financialAccounts.ledgerAccountId)))
      .where(and(
        eq(financialAccounts.shopId, shopId),
        eq(financialAccounts.isActive, true),
        eq(financialAccounts.kind, "CASH"),
        eq(ledgerAccounts.active, true),
        eq(ledgerAccounts.accountType, "ASSET"),
        eq(ledgerAccounts.normalBalance, "DEBIT"),
      )).orderBy(asc(financialAccounts.name)),
    db.select({
      id: cashSessions.id,
      financialAccountId: cashSessions.financialAccountId,
      accountName: financialAccounts.name,
      openingAmount: cashSessions.openingAmount,
      openingLedgerBalance: cashSessions.openingLedgerBalance,
      expectedClosingAmount: cashSessions.expectedClosingAmount,
      actualClosingAmount: cashSessions.actualClosingAmount,
      difference: cashSessions.difference,
      status: cashSessions.status,
      openedBy: cashSessions.openedBy,
      openedAt: cashSessions.openedAt,
      closedBy: cashSessions.closedBy,
      closedAt: cashSessions.closedAt,
    }).from(cashSessions)
      .innerJoin(financialAccounts, and(
        eq(financialAccounts.shopId, cashSessions.shopId),
        eq(financialAccounts.id, cashSessions.financialAccountId),
      ))
      .where(eq(cashSessions.shopId, shopId))
      .orderBy(desc(cashSessions.openedAt)).limit(50),
    db.select({ parentId: ledgerAccounts.parentId }).from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, shopId), sql`${ledgerAccounts.parentId} IS NOT NULL`)),
  ]);

  const parentIds = new Set(childRows.map((row) => row.parentId).filter((id): id is string => Boolean(id)));
  const eligibleAccounts = accounts.filter((account) => !parentIds.has(account.ledgerAccountId));
  const blockedIds = new Set(sessions.filter((session) => session.status === "OPEN" || session.status === "RECONCILIATION_REQUIRED").map((session) => session.financialAccountId));
  return {
    accounts: eligibleAccounts,
    availableAccounts: eligibleAccounts.filter((account) => !blockedIds.has(account.id)),
    sessions,
  };
}

export async function openCashSessionForShop(input: {
  shopId: string;
  actorUserId: string;
  financialAccountId: string;
  openingAmount: string;
}) {
  const accountId = parseUuid(input.financialAccountId, "Cash account");
  const opening = parseMoney(input.openingAmount, "Opening physical cash");

  return db.transaction(async (tx) => {
    const account = await getCashAccountForUpdate(tx, input.shopId, accountId);
    const [existing] = await tx.select({ id: cashSessions.id, status: cashSessions.status }).from(cashSessions)
      .where(and(
        eq(cashSessions.shopId, input.shopId),
        eq(cashSessions.financialAccountId, accountId),
        inArray(cashSessions.status, ["OPEN", "RECONCILIATION_REQUIRED"]),
      )).for("update").limit(1);
    if (existing) {
      throw new CashSessionError(existing.status === "OPEN"
        ? "This cash drawer already has an open session. Close it before opening another."
        : "This cash drawer has an unacknowledged discrepancy. Review and acknowledge that session before opening another.");
    }

    const ledgerCents = await getAccountBalanceCents(tx, input.shopId, account.ledgerAccountId);
    if (ledgerCents < 0) throw new CashSessionError("The cash ledger balance is negative. Reconcile the financial account before opening a cash session.");
    const [session] = await tx.insert(cashSessions).values({
      shopId: input.shopId,
      financialAccountId: account.id,
      openingAmount: opening.formatted,
      openingLedgerBalance: fromCents(ledgerCents),
      status: "OPEN",
      openedBy: input.actorUserId,
    }).returning({ id: cashSessions.id });

    const openingDifferenceCents = opening.cents - ledgerCents;
    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.actorUserId,
      action: "CASH_SESSION_OPENED",
      entityType: "CASH_SESSION",
      entityId: session.id,
      metadata: {
        accountId: account.id,
        accountName: account.name,
        openingPhysicalCash: opening.formatted,
        openingLedgerBalance: fromCents(ledgerCents),
        openingDifference: fromSignedCents(openingDifferenceCents),
      },
    });
    return { id: session.id, accountName: account.name, openingAmount: opening.formatted, openingLedgerBalance: fromCents(ledgerCents) };
  });
}

export async function closeCashSessionForShop(input: {
  shopId: string;
  actorUserId: string;
  cashSessionId: string;
  actualClosingAmount: string;
}) {
  const sessionId = parseUuid(input.cashSessionId, "Cash session");
  const actual = parseMoney(input.actualClosingAmount, "Actual closing cash");

  return db.transaction(async (tx) => {
    const [session] = await tx.select({
      id: cashSessions.id,
      financialAccountId: cashSessions.financialAccountId,
      openingAmount: cashSessions.openingAmount,
      openingLedgerBalance: cashSessions.openingLedgerBalance,
      status: cashSessions.status,
    }).from(cashSessions).where(and(eq(cashSessions.shopId, input.shopId), eq(cashSessions.id, sessionId))).for("update").limit(1);
    if (!session) throw new CashSessionError("Cash session not found for this shop.");
    if (session.status !== "OPEN") throw new CashSessionError("Only an open cash session can be counted and closed.");

    const account = await getCashAccountForUpdate(tx, input.shopId, session.financialAccountId);
    const currentLedgerCents = await getAccountBalanceCents(tx, input.shopId, account.ledgerAccountId);
    const expectedCents = storedMoneyToCents(session.openingAmount) + currentLedgerCents - storedMoneyToCents(session.openingLedgerBalance);
    if (expectedCents < 0) throw new CashSessionError("The calculated expected physical cash is negative. Reconcile ledger activity before closing this session.");
    const differenceCents = actual.cents - expectedCents;
    const status = differenceCents === 0 ? "CLOSED" : "RECONCILIATION_REQUIRED";
    await tx.update(cashSessions).set({
      expectedClosingAmount: fromCents(expectedCents),
      actualClosingAmount: actual.formatted,
      difference: fromSignedCents(differenceCents),
      status,
      closedBy: input.actorUserId,
      closedAt: new Date(),
    }).where(and(eq(cashSessions.shopId, input.shopId), eq(cashSessions.id, sessionId)));
    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.actorUserId,
      action: status === "CLOSED" ? "CASH_SESSION_CLOSED" : "CASH_SESSION_RECONCILIATION_REQUIRED",
      entityType: "CASH_SESSION",
      entityId: session.id,
      metadata: {
        accountId: account.id,
        accountName: account.name,
        openingAmount: session.openingAmount,
        openingLedgerBalance: session.openingLedgerBalance,
        closingLedgerBalance: fromSignedCents(currentLedgerCents),
        expectedClosingAmount: fromCents(expectedCents),
        actualClosingAmount: actual.formatted,
        difference: fromSignedCents(differenceCents),
        status,
      },
    });
    return {
      id: session.id,
      accountName: account.name,
      expectedClosingAmount: fromCents(expectedCents),
      actualClosingAmount: actual.formatted,
      difference: fromSignedCents(differenceCents),
      status,
    };
  });
}

export async function acknowledgeCashDiscrepancyForShop(input: {
  shopId: string;
  actorUserId: string;
  cashSessionId: string;
  reason: string;
}) {
  const sessionId = parseUuid(input.cashSessionId, "Cash session");
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 1000) throw new CashSessionError("Provide a discrepancy review note between 5 and 1,000 characters.");

  return db.transaction(async (tx) => {
    const [session] = await tx.select({
      id: cashSessions.id,
      financialAccountId: cashSessions.financialAccountId,
      difference: cashSessions.difference,
      status: cashSessions.status,
    }).from(cashSessions).where(and(eq(cashSessions.shopId, input.shopId), eq(cashSessions.id, sessionId))).for("update").limit(1);
    if (!session) throw new CashSessionError("Cash session not found for this shop.");
    if (session.status !== "RECONCILIATION_REQUIRED") throw new CashSessionError("This session does not require discrepancy acknowledgement.");
    const [account] = await tx.select({ name: financialAccounts.name }).from(financialAccounts)
      .where(and(eq(financialAccounts.shopId, input.shopId), eq(financialAccounts.id, session.financialAccountId))).limit(1);
    if (!account) throw new CashSessionError("The cash account for this session could not be found.");

    await tx.update(cashSessions).set({ status: "CLOSED" })
      .where(and(eq(cashSessions.shopId, input.shopId), eq(cashSessions.id, sessionId)));
    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.actorUserId,
      action: "CASH_DISCREPANCY_ACKNOWLEDGED",
      entityType: "CASH_SESSION",
      entityId: session.id,
      metadata: { accountName: account.name, difference: session.difference, reason, accountingAdjustmentPosted: false },
    });
    return { id: session.id, accountName: account.name, difference: session.difference ?? "0.00" };
  });
}
