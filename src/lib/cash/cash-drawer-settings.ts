import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs, cashDrawerDefaults, financialAccounts, ledgerAccounts } from "@/db/schema";

type CashDbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type CashDrawerPurpose = "RETAIL" | "SERVICES";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CashDrawerSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashDrawerSettingsError";
  }
}

async function listEligibleCashDrawers(shopId: string) {
  const accounts = await db.select({
    id: financialAccounts.id,
    name: financialAccounts.name,
    kind: financialAccounts.kind,
    isActive: financialAccounts.isActive,
    ledgerAccountId: ledgerAccounts.id,
    ledgerAccountName: ledgerAccounts.name,
    ledgerActive: ledgerAccounts.active,
    accountType: ledgerAccounts.accountType,
    normalBalance: ledgerAccounts.normalBalance,
  }).from(financialAccounts)
    .innerJoin(ledgerAccounts, and(
      eq(ledgerAccounts.shopId, financialAccounts.shopId),
      eq(ledgerAccounts.id, financialAccounts.ledgerAccountId),
    ))
    .where(and(
      eq(financialAccounts.shopId, shopId),
      eq(financialAccounts.kind, "CASH"),
      eq(financialAccounts.isActive, true),
      eq(ledgerAccounts.active, true),
      eq(ledgerAccounts.accountType, "ASSET"),
      eq(ledgerAccounts.normalBalance, "DEBIT"),
    ))
    .orderBy(asc(financialAccounts.name));

  if (!accounts.length) return [];
  const childRows = await db.select({ parentId: ledgerAccounts.parentId }).from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.shopId, shopId), inArray(ledgerAccounts.parentId, accounts.map((row) => row.ledgerAccountId))));
  const parents = new Set(childRows.map((row) => row.parentId).filter((id): id is string => Boolean(id)));
  return accounts.filter((row) => !parents.has(row.ledgerAccountId));
}

export async function getCashDrawerSettingsPageData(shopId: string) {
  const [accounts, assignments] = await Promise.all([
    listEligibleCashDrawers(shopId),
    db.select({ purpose: cashDrawerDefaults.purpose, financialAccountId: cashDrawerDefaults.financialAccountId })
      .from(cashDrawerDefaults).where(eq(cashDrawerDefaults.shopId, shopId)),
  ]);
  const retailAssignment = assignments.find((row) => row.purpose === "RETAIL");
  const serviceAssignment = assignments.find((row) => row.purpose === "SERVICES");
  // Before the first explicit setup, preserve current POS behavior by using the existing Main Cash Drawer.
  const mainCashDrawer = accounts.find((row) => row.name.trim().toLowerCase() === "main cash drawer");
  const accountIsEligible = (id: string | undefined) => Boolean(id && accounts.some((row) => row.id === id));
  return {
    accounts: accounts.map(({ id, name }) => ({ id, name })),
    retailCashAccountId: accountIsEligible(retailAssignment?.financialAccountId)
      ? retailAssignment!.financialAccountId
      : !retailAssignment ? mainCashDrawer?.id ?? "" : "",
    serviceCashAccountId: accountIsEligible(serviceAssignment?.financialAccountId) ? serviceAssignment!.financialAccountId : "",
    retailHasExplicitAssignment: Boolean(retailAssignment),
    servicesHasExplicitAssignment: Boolean(serviceAssignment),
    invalidRetailAssignment: Boolean(retailAssignment && !accountIsEligible(retailAssignment.financialAccountId)),
    invalidServicesAssignment: Boolean(serviceAssignment && !accountIsEligible(serviceAssignment.financialAccountId)),
  };
}

export async function getDefaultCashDrawerForShop(shopId: string, purpose: CashDrawerPurpose): Promise<string | null> {
  const [assignment] = await db.select({ id: cashDrawerDefaults.id, financialAccountId: cashDrawerDefaults.financialAccountId })
    .from(cashDrawerDefaults)
    .where(and(eq(cashDrawerDefaults.shopId, shopId), eq(cashDrawerDefaults.purpose, purpose)))
    .limit(1);

  if (assignment) {
    const eligible = await listEligibleCashDrawers(shopId);
    return eligible.some((row) => row.id === assignment.financialAccountId) ? assignment.financialAccountId : null;
  }

  // Safe compatibility fallback for existing shops: no assignment means legacy Main Cash Drawer for retail only.
  if (purpose === "RETAIL") {
    const eligible = await listEligibleCashDrawers(shopId);
    return eligible.find((row) => row.name.trim().toLowerCase() === "main cash drawer")?.id ?? null;
  }
  return null;
}

async function validateCashDrawerInTransaction(tx: CashDbTx, shopId: string, accountId: string) {
  const [account] = await tx.select({
    id: financialAccounts.id,
    name: financialAccounts.name,
    kind: financialAccounts.kind,
    isActive: financialAccounts.isActive,
    ledgerAccountId: ledgerAccounts.id,
    ledgerActive: ledgerAccounts.active,
    accountType: ledgerAccounts.accountType,
    normalBalance: ledgerAccounts.normalBalance,
  }).from(financialAccounts)
    .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, financialAccounts.shopId), eq(ledgerAccounts.id, financialAccounts.ledgerAccountId)))
    .where(and(eq(financialAccounts.shopId, shopId), eq(financialAccounts.id, accountId)))
    .for("update").limit(1);
  if (!account || !account.isActive || account.kind !== "CASH" || !account.ledgerActive || account.accountType !== "ASSET" || account.normalBalance !== "DEBIT") {
    throw new CashDrawerSettingsError("Choose an active CASH financial account mapped to an active debit-normal asset ledger account.");
  }
  const [child] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.shopId, shopId), eq(ledgerAccounts.parentId, account.ledgerAccountId))).limit(1);
  if (child) throw new CashDrawerSettingsError(`Choose a specific cash drawer, not a parent account for ${account.name}.`);
  return account;
}

export async function saveCashDrawerDefaultsForShop(input: {
  shopId: string;
  actorUserId: string;
  retailCashAccountId: string;
  serviceCashAccountId: string;
}) {
  const retailId = input.retailCashAccountId.trim();
  const servicesId = input.serviceCashAccountId.trim();
  for (const [label, id] of [["Retail cash drawer", retailId], ["Services cash drawer", servicesId]] as const) {
    if (id && !UUID_PATTERN.test(id)) throw new CashDrawerSettingsError(`${label} selection is invalid. Refresh and try again.`);
  }
  if (retailId && servicesId && retailId === servicesId) {
    throw new CashDrawerSettingsError("Retail and Services must use different cash drawer accounts so their physical cash can be reconciled separately.");
  }

  return db.transaction(async (tx) => {
    const beforeRows = await tx.select({ purpose: cashDrawerDefaults.purpose, financialAccountId: cashDrawerDefaults.financialAccountId })
      .from(cashDrawerDefaults).where(eq(cashDrawerDefaults.shopId, input.shopId)).for("update");
    const before: Record<string, string> = {};
    for (const row of beforeRows) before[row.purpose] = row.financialAccountId;

    const afterAccounts: Array<{ purpose: CashDrawerPurpose; id: string; name: string }> = [];
    if (retailId) {
      const account = await validateCashDrawerInTransaction(tx, input.shopId, retailId);
      afterAccounts.push({ purpose: "RETAIL", id: account.id, name: account.name });
    }
    if (servicesId) {
      const account = await validateCashDrawerInTransaction(tx, input.shopId, servicesId);
      afterAccounts.push({ purpose: "SERVICES", id: account.id, name: account.name });
    }

    await tx.delete(cashDrawerDefaults).where(eq(cashDrawerDefaults.shopId, input.shopId));
    if (afterAccounts.length) {
      await tx.insert(cashDrawerDefaults).values(afterAccounts.map((account) => ({
        shopId: input.shopId,
        purpose: account.purpose,
        financialAccountId: account.id,
        assignedBy: input.actorUserId,
      })));
    }

    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.actorUserId,
      action: "CASH_DRAWER_DEFAULTS_UPDATED",
      entityType: "CASH_DRAWER_SETTINGS",
      entityId: input.shopId,
      metadata: {
        before,
        after: Object.fromEntries(afterAccounts.map((account) => [account.purpose, { id: account.id, name: account.name }] as const)),
      },
    });

    return {
      retailAccountName: afterAccounts.find((row) => row.purpose === "RETAIL")?.name ?? null,
      servicesAccountName: afterAccounts.find((row) => row.purpose === "SERVICES")?.name ?? null,
    };
  });
}
