import "server-only";

import Decimal from "decimal.js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  auditLogs,
  customers,
  documentSequences,
  financialAccounts,
  imeiDevices,
  inventoryBalances,
  inventoryMovements,
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  productVariants,
  returnRefunds,
  saleItems,
  salePayments,
  saleReturnItems,
  saleReturns,
  sales,
} from "@/db/schema";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MONEY = new Decimal("999999999999.99");
type ReturnCondition = "RESTOCK" | "DAMAGED" | "OTHER";
type ReturnInput = { saleItemId: string; quantity: number; condition: ReturnCondition };

export class SaleReturnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleReturnError";
  }
}

function cents(value: Decimal | string | number): number {
  return new Decimal(value).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function moneyFromCents(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new SaleReturnError("A calculated return amount is outside the supported range.");
  return new Decimal(value).div(100).toFixed(2);
}

function parseReturnItems(raw: string): ReturnInput[] {
  let parsed: unknown;
  try {
    if (!raw || raw.length > 30_000) throw new Error("invalid length");
    parsed = JSON.parse(raw);
  } catch {
    throw new SaleReturnError("Return items are invalid. Refresh the page and try again.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 50) {
    throw new SaleReturnError("Select at least one item to return, and return no more than 50 different sale lines at once.");
  }

  const seen = new Set<string>();
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new SaleReturnError(`Return line ${index + 1} is invalid.`);
    const row = entry as Record<string, unknown>;
    const saleItemId = typeof row.saleItemId === "string" ? row.saleItemId.trim() : "";
    const quantity = row.quantity;
    const condition = row.condition;
    if (!UUID_PATTERN.test(saleItemId)) throw new SaleReturnError(`Return line ${index + 1} has an invalid sale item.`);
    if (seen.has(saleItemId)) throw new SaleReturnError("A sale item can appear only once in a return. Combine its quantity into one line.");
    seen.add(saleItemId);
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw new SaleReturnError(`Return line ${index + 1} quantity must be a whole number greater than zero.`);
    }
    if (condition !== "RESTOCK" && condition !== "DAMAGED" && condition !== "OTHER") {
      throw new SaleReturnError(`Return line ${index + 1} has an invalid item condition.`);
    }
    return { saleItemId, quantity, condition };
  });
}

function pakistanYear(date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", year: "numeric" }).format(date));
}

/** Split a saved net line total into deterministic per-unit cents, so partial returns add up exactly. */
function valueForUnits(totalCents: number, originalQuantity: number, offset: number, quantity: number): number {
  const base = Math.floor(totalCents / originalQuantity);
  const extraCents = totalCents % originalQuantity;
  let result = 0;
  for (let unit = offset; unit < offset + quantity; unit += 1) result += base + (unit < extraCents ? 1 : 0);
  return result;
}

async function getPaymentAccounts(shopId: string) {
  const candidates = await db
    .select({ id: financialAccounts.id, name: financialAccounts.name, kind: financialAccounts.kind, ledgerAccountId: ledgerAccounts.id })
    .from(financialAccounts)
    .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.id, financialAccounts.ledgerAccountId), eq(ledgerAccounts.shopId, financialAccounts.shopId)))
    .where(and(eq(financialAccounts.shopId, shopId), eq(financialAccounts.isActive, true), eq(ledgerAccounts.active, true), eq(ledgerAccounts.accountType, "ASSET"), eq(ledgerAccounts.normalBalance, "DEBIT")))
    .orderBy(asc(financialAccounts.name));
  const parentRows = candidates.length > 0
    ? await db.select({ parentId: ledgerAccounts.parentId }).from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, shopId), inArray(ledgerAccounts.parentId, candidates.map((account) => account.ledgerAccountId))))
    : [];
  const parentIds = new Set(parentRows.map((row) => row.parentId).filter((id): id is string => id !== null));
  return candidates.filter((account) => !parentIds.has(account.ledgerAccountId)).map(({ id, name, kind }) => ({ id, name, kind }));
}

export async function getSaleReturnHistoryForShop(shopId: string, saleId: string) {
  if (!UUID_PATTERN.test(saleId)) return null;
  const [headers, itemRows, refundRows] = await Promise.all([
    db.select({ id: saleReturns.id, documentNo: saleReturns.documentNo, replacementSaleId: saleReturns.replacementSaleId, reason: saleReturns.reason, refundAmount: saleReturns.refundAmount, createdAt: saleReturns.createdAt, status: saleReturns.status })
      .from(saleReturns)
      .where(and(eq(saleReturns.shopId, shopId), eq(saleReturns.originalSaleId, saleId), eq(saleReturns.status, "COMPLETED")))
      .orderBy(desc(saleReturns.createdAt)),
    db.select({
      saleItemId: saleReturnItems.saleItemId,
      returnId: saleReturnItems.returnId,
      quantity: saleReturnItems.quantity,
      amount: saleReturnItems.amount,
      condition: saleReturnItems.condition,
      description: saleItems.descriptionSnapshot,
      imei1: imeiDevices.imei1,
    })
      .from(saleReturnItems)
      .innerJoin(saleReturns, and(eq(saleReturns.shopId, saleReturnItems.shopId), eq(saleReturns.id, saleReturnItems.returnId)))
      .innerJoin(saleItems, and(eq(saleItems.shopId, saleReturnItems.shopId), eq(saleItems.id, saleReturnItems.saleItemId)))
      .leftJoin(imeiDevices, and(eq(imeiDevices.shopId, saleReturnItems.shopId), eq(imeiDevices.id, saleReturnItems.imeiDeviceId)))
      .where(and(eq(saleReturnItems.shopId, shopId), eq(saleReturns.originalSaleId, saleId), eq(saleReturns.status, "COMPLETED"))),
    db.select({ returnId: returnRefunds.returnId, amount: returnRefunds.amount, accountName: financialAccounts.name, refundedAt: returnRefunds.refundedAt })
      .from(returnRefunds)
      .innerJoin(saleReturns, and(eq(saleReturns.shopId, returnRefunds.shopId), eq(saleReturns.id, returnRefunds.returnId)))
      .innerJoin(financialAccounts, and(eq(financialAccounts.shopId, returnRefunds.shopId), eq(financialAccounts.id, returnRefunds.financialAccountId)))
      .where(and(eq(returnRefunds.shopId, shopId), eq(saleReturns.originalSaleId, saleId), eq(saleReturns.status, "COMPLETED"))),
  ]);
  const qtyByItem = new Map<string, number>();
  const amountByItem = new Map<string, Decimal>();
  const valueByReturn = new Map<string, Decimal>();
  const itemsByReturn = new Map<string, Array<{ description: string; quantity: number; amount: string; condition: ReturnCondition; imei1: string | null }>>();
  for (const item of itemRows) {
    qtyByItem.set(item.saleItemId, (qtyByItem.get(item.saleItemId) ?? 0) + item.quantity);
    amountByItem.set(item.saleItemId, (amountByItem.get(item.saleItemId) ?? new Decimal(0)).plus(item.amount));
    valueByReturn.set(item.returnId, (valueByReturn.get(item.returnId) ?? new Decimal(0)).plus(item.amount));
    const details = itemsByReturn.get(item.returnId) ?? [];
    details.push({ description: item.description, quantity: item.quantity, amount: item.amount, condition: item.condition, imei1: item.imei1 });
    itemsByReturn.set(item.returnId, details);
  }
  const refundsByReturn = new Map<string, Array<{ amount: string; accountName: string; refundedAt: Date }>>();
  const refundTotalByReturn = new Map<string, Decimal>();
  for (const refund of refundRows) {
    const list = refundsByReturn.get(refund.returnId) ?? [];
    list.push({ amount: refund.amount, accountName: refund.accountName, refundedAt: refund.refundedAt });
    refundsByReturn.set(refund.returnId, list);
    refundTotalByReturn.set(refund.returnId, (refundTotalByReturn.get(refund.returnId) ?? new Decimal(0)).plus(refund.amount));
  }
  const totalReturnedAmount = [...valueByReturn.values()].reduce((total, amount) => total.plus(amount), new Decimal(0)).toFixed(2);
  const totalCashRefunded = [...refundTotalByReturn.values()].reduce((total, amount) => total.plus(amount), new Decimal(0)).toFixed(2);
  return {
    returns: headers.map((header) => ({
      ...header,
      returnedValue: (valueByReturn.get(header.id) ?? new Decimal(0)).toFixed(2),
      cashRefunded: (refundTotalByReturn.get(header.id) ?? new Decimal(0)).toFixed(2),
      refunds: refundsByReturn.get(header.id) ?? [],
      items: itemsByReturn.get(header.id) ?? [],
    })),
    returnedQuantityBySaleItem: Object.fromEntries(qtyByItem),
    returnedAmountBySaleItem: Object.fromEntries([...amountByItem].map(([id, amount]) => [id, amount.toFixed(2)])),
    totalReturnedAmount,
    totalCashRefunded,
  };
}

export async function getSaleReturnScreenDataForShop(shopId: string, saleId: string) {
  if (!UUID_PATTERN.test(saleId)) return null;
  const [sale] = await db.select({
    id: sales.id,
    documentNo: sales.documentNo,
    status: sales.status,
    totalAmount: sales.totalAmount,
    customerId: sales.customerId,
    customerName: customers.name,
    exchangeCreditApplied: sql<string>`COALESCE((SELECT SUM(exri.amount::numeric) FROM sale_returns exr INNER JOIN sale_return_items exri ON exri.shop_id = exr.shop_id AND exri.return_id = exr.id WHERE exr.shop_id = "sales"."shop_id" AND exr.replacement_sale_id = "sales"."id" AND exr.status = 'COMPLETED'), 0)::text`,
    createdAt: sales.createdAt,
  }).from(sales)
    .leftJoin(customers, and(eq(customers.shopId, sales.shopId), eq(customers.id, sales.customerId)))
    .where(and(eq(sales.shopId, shopId), eq(sales.id, saleId)))
    .limit(1);
  if (!sale) return null;

  const [saleItemRows, history, paymentAccounts] = await Promise.all([
    db.select({
      id: saleItems.id,
      variantId: saleItems.variantId,
      imeiDeviceId: saleItems.imeiDeviceId,
      description: saleItems.descriptionSnapshot,
      quantity: saleItems.quantity,
      lineTotal: saleItems.lineTotal,
      costSnapshot: saleItems.costSnapshot,
      trackByImei: productVariants.trackByImei,
      imei1: imeiDevices.imei1,
      imei2: imeiDevices.imei2,
      serialNumber: imeiDevices.serialNumber,
    }).from(saleItems)
      .innerJoin(productVariants, and(eq(productVariants.shopId, saleItems.shopId), eq(productVariants.id, saleItems.variantId)))
      .leftJoin(imeiDevices, and(eq(imeiDevices.shopId, saleItems.shopId), eq(imeiDevices.id, saleItems.imeiDeviceId)))
      .where(and(eq(saleItems.shopId, shopId), eq(saleItems.saleId, saleId)))
      .orderBy(asc(saleItems.descriptionSnapshot)),
    getSaleReturnHistoryForShop(shopId, saleId),
    getPaymentAccounts(shopId),
  ]);
  const qtyMap = history?.returnedQuantityBySaleItem ?? {};
  const amountMap = history?.returnedAmountBySaleItem ?? {};
  return {
    sale,
    items: saleItemRows.map((item) => {
      const returnedQuantity = qtyMap[item.id] ?? 0;
      return { ...item, returnedQuantity, remainingQuantity: Math.max(0, item.quantity - returnedQuantity), previouslyReturnedAmount: amountMap[item.id] ?? "0.00" };
    }),
    history: history ?? { returns: [], returnedQuantityBySaleItem: {}, returnedAmountBySaleItem: {}, totalReturnedAmount: "0.00", totalCashRefunded: "0.00" },
    paymentAccounts,
  };
}

export async function createSaleReturnForShop(input: {
  shopId: string;
  createdBy: string;
  saleId: string;
  reason: string;
  itemsJson: string;
  refundFinancialAccountId: string;
}) {
  if (!UUID_PATTERN.test(input.saleId)) throw new SaleReturnError("The original sale reference is invalid.");
  const items = parseReturnItems(input.itemsJson);
  const reason = input.reason.trim();
  if (reason.length > 500) throw new SaleReturnError("Return reason must be 500 characters or fewer.");
  const refundAccountId = input.refundFinancialAccountId.trim();
  if (refundAccountId && !UUID_PATTERN.test(refundAccountId)) throw new SaleReturnError("Select a valid account for a cash refund.");

  return db.transaction(async (tx) => {
    const [sale] = await tx.select({ id: sales.id, documentNo: sales.documentNo, status: sales.status, totalAmount: sales.totalAmount, customerId: sales.customerId })
      .from(sales).where(and(eq(sales.shopId, input.shopId), eq(sales.id, input.saleId))).for("update");
    if (!sale) throw new SaleReturnError("The original sale was not found in this shop.");
    if (sale.status !== "COMPLETED") throw new SaleReturnError("Only completed sales can be returned.");
    const [exchangeCreditApplied] = await tx.select({ total: sql<string>`COALESCE(SUM(${saleReturnItems.amount}::numeric), 0)::text` })
      .from(saleReturnItems)
      .innerJoin(saleReturns, and(eq(saleReturns.shopId, saleReturnItems.shopId), eq(saleReturns.id, saleReturnItems.returnId)))
      .where(and(eq(saleReturnItems.shopId, input.shopId), eq(saleReturns.replacementSaleId, sale.id), eq(saleReturns.status, "COMPLETED")));
    const [priorExchangeReturn] = await tx.select({ total: sql<string>`COALESCE(SUM(${saleReturnItems.amount}::numeric), 0)::text` })
      .from(saleReturnItems)
      .innerJoin(saleReturns, and(eq(saleReturns.shopId, saleReturnItems.shopId), eq(saleReturns.id, saleReturnItems.returnId)))
      .where(and(eq(saleReturnItems.shopId, input.shopId), eq(saleReturns.originalSaleId, sale.id), sql`${saleReturns.replacementSaleId} IS NOT NULL`, eq(saleReturns.status, "COMPLETED")));
    if (new Decimal(exchangeCreditApplied?.total ?? "0").greaterThan(0) || new Decimal(priorExchangeReturn?.total ?? "0").greaterThan(0)) throw new SaleReturnError("This sale participates in an exchange. Use the exchange workflow so exchange credit is not treated as cash or refunded twice.");

    const [saleItemRows, priorRows, paidRow, priorRefundRow] = await Promise.all([
      tx.select({ id: saleItems.id, variantId: saleItems.variantId, imeiDeviceId: saleItems.imeiDeviceId, description: saleItems.descriptionSnapshot, quantity: saleItems.quantity, lineTotal: saleItems.lineTotal, costSnapshot: saleItems.costSnapshot, trackByImei: productVariants.trackByImei })
        .from(saleItems).innerJoin(productVariants, and(eq(productVariants.shopId, saleItems.shopId), eq(productVariants.id, saleItems.variantId)))
        .where(and(eq(saleItems.shopId, input.shopId), eq(saleItems.saleId, sale.id))).orderBy(asc(saleItems.id)).for("update"),
      tx.select({ saleItemId: saleReturnItems.saleItemId, quantity: saleReturnItems.quantity, amount: saleReturnItems.amount })
        .from(saleReturnItems).innerJoin(saleReturns, and(eq(saleReturns.shopId, saleReturnItems.shopId), eq(saleReturns.id, saleReturnItems.returnId)))
        .where(and(eq(saleReturnItems.shopId, input.shopId), eq(saleReturns.originalSaleId, sale.id), eq(saleReturns.status, "COMPLETED"))),
      tx.select({ total: sql<string>`COALESCE(SUM(${salePayments.amount}::numeric), 0)::text` }).from(salePayments).where(and(eq(salePayments.shopId, input.shopId), eq(salePayments.saleId, sale.id))),
      tx.select({ total: sql<string>`COALESCE(SUM(${returnRefunds.amount}::numeric), 0)::text` }).from(returnRefunds)
        .innerJoin(saleReturns, and(eq(saleReturns.shopId, returnRefunds.shopId), eq(saleReturns.id, returnRefunds.returnId)))
        .where(and(eq(returnRefunds.shopId, input.shopId), eq(saleReturns.originalSaleId, sale.id), eq(saleReturns.status, "COMPLETED"))),
    ]);
    const itemById = new Map(saleItemRows.map((row) => [row.id, row]));
    const previousQuantity = new Map<string, number>();
    const previousAmount = new Map<string, number>();
    let priorReturnValueCents = 0;
    for (const prior of priorRows) {
      previousQuantity.set(prior.saleItemId, (previousQuantity.get(prior.saleItemId) ?? 0) + prior.quantity);
      const amountCents = cents(prior.amount);
      previousAmount.set(prior.saleItemId, (previousAmount.get(prior.saleItemId) ?? 0) + amountCents);
      priorReturnValueCents += amountCents;
    }

    const prepared = items.map((requested) => {
      const original = itemById.get(requested.saleItemId);
      if (!original) throw new SaleReturnError("One or more selected items do not belong to this sale.");
      const alreadyReturned = previousQuantity.get(original.id) ?? 0;
      const remainingQuantity = original.quantity - alreadyReturned;
      if (requested.quantity > remainingQuantity || remainingQuantity <= 0) {
        throw new SaleReturnError(`${original.description} has only ${Math.max(0, remainingQuantity)} returnable unit(s) remaining.`);
      }
      if (original.imeiDeviceId && requested.quantity !== 1) throw new SaleReturnError(`The IMEI-tracked item ${original.description} must be returned one device at a time.`);
      const lineTotalCents = cents(original.lineTotal);
      const amountCents = valueForUnits(lineTotalCents, original.quantity, alreadyReturned, requested.quantity);
      const cumulativeReturnedForItem = (previousAmount.get(original.id) ?? 0) + amountCents;
      if (cumulativeReturnedForItem > lineTotalCents) throw new SaleReturnError(`Return value for ${original.description} would exceed its original line total.`);
      return { ...requested, original, amountCents, costCents: cents(original.costSnapshot) * requested.quantity };
    });

    const returnValueCents = prepared.reduce((sum, item) => sum + item.amountCents, 0);
    const saleTotalCents = cents(sale.totalAmount);
    const totalPaidCents = cents(paidRow[0]?.total ?? "0");
    const priorCashRefundCents = cents(priorRefundRow[0]?.total ?? "0");
    const totalCashRefundRequiredToDate = Math.max(0, totalPaidCents + priorReturnValueCents + returnValueCents - saleTotalCents);
    const cashRefundCents = totalCashRefundRequiredToDate - priorCashRefundCents;
    if (cashRefundCents < 0 || cashRefundCents > returnValueCents) {
      throw new SaleReturnError("The saved payments and returns do not reconcile to a valid refund amount. Review this sale before proceeding.");
    }
    const receivableReductionCents = returnValueCents - cashRefundCents;

    const restockItems = prepared.filter((item) => item.condition === "RESTOCK");
    const restockQuantityByVariant = new Map<string, number>();
    for (const item of restockItems) restockQuantityByVariant.set(item.original.variantId, (restockQuantityByVariant.get(item.original.variantId) ?? 0) + item.quantity);
    const restockCostCents = restockItems.reduce((sum, item) => sum + item.costCents, 0);

    const refundAccount = cashRefundCents > 0
      ? (await tx.select({ id: financialAccounts.id, name: financialAccounts.name, isActive: financialAccounts.isActive, ledgerAccountId: ledgerAccounts.id, ledgerActive: ledgerAccounts.active, accountType: ledgerAccounts.accountType, normalBalance: ledgerAccounts.normalBalance })
          .from(financialAccounts).innerJoin(ledgerAccounts, and(eq(ledgerAccounts.shopId, financialAccounts.shopId), eq(ledgerAccounts.id, financialAccounts.ledgerAccountId)))
          .where(and(eq(financialAccounts.shopId, input.shopId), eq(financialAccounts.id, refundAccountId))).for("update"))[0]
      : null;
    if (cashRefundCents > 0 && (!refundAccountId || !refundAccount || !refundAccount.isActive || !refundAccount.ledgerActive || refundAccount.accountType !== "ASSET" || refundAccount.normalBalance !== "DEBIT")) {
      throw new SaleReturnError("A cash refund is due. Select an active financial account mapped to a debit-balance asset ledger account.");
    }

    const requiredCodes = [
      ...(returnValueCents > 0 ? ["4900"] : []),
      ...(receivableReductionCents > 0 ? ["1300"] : []),
      ...(restockCostCents > 0 ? ["1200", "5000"] : []),
    ];
    const systemAccounts = requiredCodes.length > 0
      ? await tx.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, input.shopId), inArray(ledgerAccounts.code, [...new Set(requiredCodes)]), eq(ledgerAccounts.active, true))).for("update")
      : [];
    const accountByCode = new Map(systemAccounts.map((account) => [account.code, account]));
    const salesReturnsLedger = accountByCode.get("4900");
    const receivableLedger = accountByCode.get("1300");
    const inventoryLedger = accountByCode.get("1200");
    const cogsLedger = accountByCode.get("5000");
    if (returnValueCents > 0 && (!salesReturnsLedger || salesReturnsLedger.accountType !== "REVENUE" || salesReturnsLedger.normalBalance !== "DEBIT")) {
      throw new SaleReturnError("Sales Returns ledger account (code 4900) must be active, classified as REVENUE, and have DEBIT normal balance.");
    }
    if (receivableReductionCents > 0 && (!receivableLedger || receivableLedger.accountType !== "ASSET" || receivableLedger.normalBalance !== "DEBIT")) {
      throw new SaleReturnError("Accounts Receivable ledger account (code 1300) is missing, inactive, or incorrectly configured.");
    }
    if (restockCostCents > 0 && (!inventoryLedger || inventoryLedger.accountType !== "ASSET" || inventoryLedger.normalBalance !== "DEBIT" || !cogsLedger || cogsLedger.accountType !== "EXPENSE" || cogsLedger.normalBalance !== "DEBIT")) {
      throw new SaleReturnError("Inventory (1200) or COGS (5000) ledger accounts are missing, inactive, or incorrectly configured.");
    }

    const leafPostingIds = [
      ...(salesReturnsLedger && returnValueCents > 0 ? [salesReturnsLedger.id] : []),
      ...(receivableLedger && receivableReductionCents > 0 ? [receivableLedger.id] : []),
      ...(inventoryLedger && cogsLedger && restockCostCents > 0 ? [inventoryLedger.id, cogsLedger.id] : []),
      ...(refundAccount && cashRefundCents > 0 ? [refundAccount.ledgerAccountId] : []),
    ];
    if (leafPostingIds.length > 0) {
      const children = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, input.shopId), inArray(ledgerAccounts.parentId, leafPostingIds))).limit(1);
      if (children.length > 0) throw new SaleReturnError("A return journal cannot post directly to a parent ledger account. Verify that all selected and system ledger accounts are leaf accounts.");
    }

    if (cashRefundCents > 0 && refundAccount) {
      const [available] = await tx.select({ balance: sql<string>`COALESCE(SUM(${ledgerEntries.debit}::numeric - ${ledgerEntries.credit}::numeric), 0)::text` })
        .from(ledgerEntries).where(and(eq(ledgerEntries.shopId, input.shopId), eq(ledgerEntries.ledgerAccountId, refundAccount.ledgerAccountId)));
      if (cents(available?.balance ?? "0") < cashRefundCents) throw new SaleReturnError(`The selected refund account has less than Rs ${moneyFromCents(cashRefundCents)} available in its recorded ledger balance.`);
    }
    if (receivableReductionCents > 0 && receivableLedger) {
      const [available] = await tx.select({ balance: sql<string>`COALESCE(SUM(${ledgerEntries.debit}::numeric - ${ledgerEntries.credit}::numeric), 0)::text` })
        .from(ledgerEntries).where(and(eq(ledgerEntries.shopId, input.shopId), eq(ledgerEntries.ledgerAccountId, receivableLedger.id)));
      if (cents(available?.balance ?? "0") < receivableReductionCents) throw new SaleReturnError("The Accounts Receivable ledger balance is lower than the return being applied. Reconcile the ledger before processing this return.");
    }

    const inventoryVariantIds = [...restockQuantityByVariant.keys()].sort();
    const balances = inventoryVariantIds.length > 0
      ? await tx.select({ id: inventoryBalances.id, variantId: inventoryBalances.variantId, quantity: inventoryBalances.quantity, averageCost: inventoryBalances.averageCost }).from(inventoryBalances)
          .where(and(eq(inventoryBalances.shopId, input.shopId), inArray(inventoryBalances.variantId, inventoryVariantIds))).orderBy(asc(inventoryBalances.variantId)).for("update")
      : [];
    if (balances.length !== inventoryVariantIds.length) throw new SaleReturnError("An inventory balance row is missing for a returned item. No return was posted; investigate the inventory records.");
    const balanceByVariant = new Map(balances.map((balance) => [balance.variantId, balance]));

    const deviceIds = prepared.map((item) => item.original.imeiDeviceId).filter((id): id is string => id !== null);
    const deviceRows = deviceIds.length > 0
      ? await tx.select({ id: imeiDevices.id, status: imeiDevices.status }).from(imeiDevices).where(and(eq(imeiDevices.shopId, input.shopId), inArray(imeiDevices.id, deviceIds))).orderBy(asc(imeiDevices.id)).for("update")
      : [];
    const deviceById = new Map(deviceRows.map((device) => [device.id, device]));
    for (const item of prepared) {
      if (!item.original.imeiDeviceId) continue;
      const device = deviceById.get(item.original.imeiDeviceId);
      if (!device || device.status !== "SOLD") throw new SaleReturnError(`The IMEI device for ${item.original.description} is not currently marked SOLD. Review its history before returning it.`);
    }

    const year = pakistanYear();
    const [{ lastValue }] = await tx.insert(documentSequences).values({ shopId: input.shopId, documentType: "SALE_RETURN", year, lastValue: 1 })
      .onConflictDoUpdate({ target: [documentSequences.shopId, documentSequences.documentType, documentSequences.year], set: { lastValue: sql`${documentSequences.lastValue} + 1` } })
      .returning({ lastValue: documentSequences.lastValue });
    const documentNo = `RET-${year}-${String(lastValue).padStart(6, "0")}`;
    const [returnHeader] = await tx.insert(saleReturns).values({
      shopId: input.shopId,
      documentNo,
      originalSaleId: sale.id,
      status: "COMPLETED",
      reason: reason || null,
      refundAmount: moneyFromCents(cashRefundCents),
      createdBy: input.createdBy,
      completedAt: new Date(),
    }).returning({ id: saleReturns.id, documentNo: saleReturns.documentNo });

    const createdReturnItems = await tx.insert(saleReturnItems).values(prepared.map((item) => ({
      shopId: input.shopId,
      returnId: returnHeader.id,
      saleItemId: item.original.id,
      imeiDeviceId: item.original.imeiDeviceId,
      quantity: item.quantity,
      amount: moneyFromCents(item.amountCents),
      condition: item.condition,
    }))).returning({ id: saleReturnItems.id, saleItemId: saleReturnItems.saleItemId });
    const returnItemIdBySaleItem = new Map(createdReturnItems.map((row) => [row.saleItemId, row.id]));

    for (const variantId of inventoryVariantIds) {
      const balance = balanceByVariant.get(variantId)!;
      const addQuantity = restockQuantityByVariant.get(variantId)!;
      const lines = restockItems.filter((item) => item.original.variantId === variantId);
      const addCost = lines.reduce((total, item) => total.plus(new Decimal(item.original.costSnapshot).mul(item.quantity)), new Decimal(0));
      const newQuantity = balance.quantity + addQuantity;
      const newAverageCost = new Decimal(balance.averageCost).mul(balance.quantity).plus(addCost).div(newQuantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
      await tx.update(inventoryBalances).set({ quantity: newQuantity, averageCost: newAverageCost, updatedAt: new Date() })
        .where(and(eq(inventoryBalances.shopId, input.shopId), eq(inventoryBalances.variantId, variantId)));
    }

    for (const item of prepared) {
      if (item.original.imeiDeviceId) {
        const nextStatus = item.condition === "RESTOCK" ? "IN_STOCK" : item.condition === "DAMAGED" ? "DAMAGED" : "RETURNED";
        const [updated] = await tx.update(imeiDevices).set({ status: nextStatus, updatedAt: new Date() })
          .where(and(eq(imeiDevices.shopId, input.shopId), eq(imeiDevices.id, item.original.imeiDeviceId), eq(imeiDevices.status, "SOLD"))).returning({ id: imeiDevices.id });
        if (!updated) throw new SaleReturnError("An IMEI device status changed while the return was being completed. No return was committed.");
      }
      if (item.condition === "RESTOCK") {
        await tx.insert(inventoryMovements).values({
          shopId: input.shopId,
          variantId: item.original.variantId,
          imeiDeviceId: item.original.imeiDeviceId,
          quantityDelta: item.quantity,
          movementType: "RETURN",
          unitCost: item.original.costSnapshot,
          referenceType: "SALE_RETURN_ITEM",
          referenceId: returnItemIdBySaleItem.get(item.original.id)!,
          note: `Restocked under ${documentNo} from ${sale.documentNo}`,
          createdBy: input.createdBy,
        });
      }
    }

    if (cashRefundCents > 0 && refundAccount) {
      await tx.insert(returnRefunds).values({ shopId: input.shopId, returnId: returnHeader.id, financialAccountId: refundAccount.id, amount: moneyFromCents(cashRefundCents), createdBy: input.createdBy });
    }

    const journalLines: Array<{ ledgerAccountId: string; debit: string; credit: string; description: string }> = [];
    if (returnValueCents > 0 && salesReturnsLedger) journalLines.push({ ledgerAccountId: salesReturnsLedger.id, debit: moneyFromCents(returnValueCents), credit: "0.00", description: `Sales return - ${documentNo} / ${sale.documentNo}` });
    if (receivableReductionCents > 0 && receivableLedger) journalLines.push({ ledgerAccountId: receivableLedger.id, debit: "0.00", credit: moneyFromCents(receivableReductionCents), description: `Customer receivable reduced by return - ${documentNo}` });
    if (cashRefundCents > 0 && refundAccount) journalLines.push({ ledgerAccountId: refundAccount.ledgerAccountId, debit: "0.00", credit: moneyFromCents(cashRefundCents), description: `Refund paid from ${refundAccount.name} - ${documentNo}` });
    if (restockCostCents > 0 && inventoryLedger && cogsLedger) {
      journalLines.push({ ledgerAccountId: inventoryLedger.id, debit: moneyFromCents(restockCostCents), credit: "0.00", description: `Restocked inventory cost - ${documentNo}` });
      journalLines.push({ ledgerAccountId: cogsLedger.id, debit: "0.00", credit: moneyFromCents(restockCostCents), description: `Reverse COGS for sellable returned goods - ${documentNo}` });
    }
    if (journalLines.length > 0) {
      const debits = journalLines.reduce((total, line) => total.plus(line.debit), new Decimal(0));
      const credits = journalLines.reduce((total, line) => total.plus(line.credit), new Decimal(0));
      if (!debits.equals(credits)) throw new SaleReturnError("The return journal is not balanced. Nothing was posted.");
      const [journal] = await tx.insert(ledgerTransactions).values({
        shopId: input.shopId,
        referenceType: "SALE_RETURN",
        referenceId: returnHeader.id,
        description: `Sale return completed: ${documentNo}`,
        createdBy: input.createdBy,
      }).returning({ id: ledgerTransactions.id });
      await tx.insert(ledgerEntries).values(journalLines.map((line) => ({ shopId: input.shopId, ledgerTransactionId: journal.id, ...line })));
    }

    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.createdBy,
      action: "SALE_RETURN_COMPLETED",
      entityType: "SALE_RETURN",
      entityId: returnHeader.id,
      metadata: {
        documentNo,
        originalSaleId: sale.id,
        originalSaleDocumentNo: sale.documentNo,
        customerId: sale.customerId,
        returnedValue: moneyFromCents(returnValueCents),
        cashRefund: moneyFromCents(cashRefundCents),
        receivableReduction: moneyFromCents(receivableReductionCents),
        restockCostReversed: moneyFromCents(restockCostCents),
        items: prepared.map((item) => ({ saleItemId: item.original.id, description: item.original.description, quantity: item.quantity, condition: item.condition, amount: moneyFromCents(item.amountCents) })),
      },
    });

    return {
      id: returnHeader.id,
      documentNo,
      originalSaleDocumentNo: sale.documentNo,
      returnedValue: moneyFromCents(returnValueCents),
      cashRefund: moneyFromCents(cashRefundCents),
      receivableReduction: moneyFromCents(receivableReductionCents),
      restockCostReversed: moneyFromCents(restockCostCents),
      customerId: sale.customerId,
    };
  });
}
