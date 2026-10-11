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
  products,
  saleItems,
  salePayments,
  saleReturnItems,
  saleReturns,
  sales,
} from "@/db/schema";
import { getPosScreenDataForShop } from "@/lib/pos/checkout";
import { getSaleReturnScreenDataForShop } from "@/lib/pos/returns";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MONEY = new Decimal("999999999999.99");
const MAX_LINES = 100;
const MAX_PAYMENT_SPLITS = 10;
type ReturnCondition = "RESTOCK" | "DAMAGED" | "OTHER";
type ReturnLine = { saleItemId: string; quantity: number; condition: ReturnCondition };
type CartLine = { variantId: string; quantity: number; imeiDeviceId: string | null };
type PaymentAllocation = { financialAccountId: string; amountCents: number };

export class SaleExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleExchangeError";
  }
}

function cents(value: Decimal | string | number): number {
  return new Decimal(value).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function moneyFromCents(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new SaleExchangeError("A calculated exchange amount is outside the supported range.");
  return new Decimal(value).div(100).toFixed(2);
}

function parseMoney(value: string, label: string): Decimal {
  const normalized = value.trim();
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) throw new SaleExchangeError(`${label} must be a valid amount with up to two decimal places.`);
  const result = new Decimal(normalized);
  if (!result.isFinite() || result.isNegative() || result.greaterThan(MAX_MONEY)) throw new SaleExchangeError(`${label} is outside the supported range.`);
  return result;
}

function parseReturnItems(raw: string): ReturnLine[] {
  let parsed: unknown;
  try {
    if (!raw || raw.length > 30_000) throw new Error("invalid length");
    parsed = JSON.parse(raw);
  } catch {
    throw new SaleExchangeError("The returned items are invalid. Refresh the page and try again.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 50) throw new SaleExchangeError("Choose at least one and no more than 50 original sale lines to return.");
  const seen = new Set<string>();
  return parsed.map((value, index) => {
    if (!value || typeof value !== "object") throw new SaleExchangeError(`Return line ${index + 1} is invalid.`);
    const row = value as Record<string, unknown>;
    const saleItemId = typeof row.saleItemId === "string" ? row.saleItemId.trim() : "";
    const condition = row.condition;
    if (!UUID_PATTERN.test(saleItemId)) throw new SaleExchangeError(`Return line ${index + 1} has an invalid original sale item.`);
    if (seen.has(saleItemId)) throw new SaleExchangeError("Each original sale line may appear only once in an exchange.");
    seen.add(saleItemId);
    if (typeof row.quantity !== "number" || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 999) throw new SaleExchangeError(`Return line ${index + 1} quantity must be a whole number greater than zero.`);
    if (condition !== "RESTOCK" && condition !== "DAMAGED" && condition !== "OTHER") throw new SaleExchangeError(`Return line ${index + 1} has an invalid item condition.`);
    return { saleItemId, quantity: row.quantity, condition };
  });
}

function parseCart(raw: string): CartLine[] {
  let parsed: unknown;
  try {
    if (!raw || raw.length > 100_000) throw new Error("invalid length");
    parsed = JSON.parse(raw);
  } catch {
    throw new SaleExchangeError("The replacement cart is invalid. Refresh the page and rebuild it.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_LINES) throw new SaleExchangeError(`Add between 1 and ${MAX_LINES} replacement sale lines.`);
  return parsed.map((value, index) => {
    if (!value || typeof value !== "object") throw new SaleExchangeError(`Replacement sale line ${index + 1} is invalid.`);
    const row = value as Record<string, unknown>;
    const variantId = typeof row.variantId === "string" ? row.variantId.trim() : "";
    const imeiDeviceId = row.imeiDeviceId === null || row.imeiDeviceId === undefined || row.imeiDeviceId === "" ? null : typeof row.imeiDeviceId === "string" ? row.imeiDeviceId.trim() : "invalid";
    if (!UUID_PATTERN.test(variantId)) throw new SaleExchangeError(`Replacement sale line ${index + 1} has an invalid variant.`);
    if (typeof row.quantity !== "number" || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 999) throw new SaleExchangeError(`Replacement sale line ${index + 1} quantity must be a whole number from 1 to 999.`);
    if (imeiDeviceId === "invalid" || (imeiDeviceId && !UUID_PATTERN.test(imeiDeviceId))) throw new SaleExchangeError(`Replacement sale line ${index + 1} has an invalid IMEI device.`);
    return { variantId, quantity: row.quantity, imeiDeviceId };
  });
}

function parsePayments(raw: string): PaymentAllocation[] {
  let parsed: unknown;
  try {
    if (!raw || raw.length > 20_000) throw new Error("invalid length");
    parsed = JSON.parse(raw);
  } catch {
    throw new SaleExchangeError("Payment allocations are invalid. Refresh the page and try again.");
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_PAYMENT_SPLITS) throw new SaleExchangeError(`Use no more than ${MAX_PAYMENT_SPLITS} payment account rows.`);
  const seen = new Set<string>();
  return parsed.map((value, index) => {
    if (!value || typeof value !== "object") throw new SaleExchangeError(`Payment row ${index + 1} is invalid.`);
    const row = value as Record<string, unknown>;
    const financialAccountId = typeof row.financialAccountId === "string" ? row.financialAccountId.trim() : "";
    const amountRaw = typeof row.amount === "string" ? row.amount.trim() : "";
    if (!UUID_PATTERN.test(financialAccountId)) throw new SaleExchangeError(`Select a valid financial account for payment ${index + 1}.`);
    if (seen.has(financialAccountId)) throw new SaleExchangeError("Use each payment account only once; combine amounts for the same account.");
    seen.add(financialAccountId);
    const amountCents = cents(parseMoney(amountRaw, `Payment ${index + 1}`));
    if (amountCents <= 0) throw new SaleExchangeError(`Payment ${index + 1} must be greater than Rs 0.00.`);
    return { financialAccountId, amountCents };
  });
}

function pakistanYear(date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", year: "numeric" }).format(date));
}

function pakistanDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (key: string) => parts.find((item) => item.type === key)?.value ?? "";
  return { year: Number(part("year")), date: `${part("year")}-${part("month")}-${part("day")}` };
}

function valueForUnits(totalCents: number, originalQuantity: number, offset: number, quantity: number): number {
  const base = Math.floor(totalCents / originalQuantity);
  const extraCents = totalCents % originalQuantity;
  let result = 0;
  for (let index = offset; index < offset + quantity; index += 1) result += base + (index < extraCents ? 1 : 0);
  return result;
}

function allocateDiscount(lineGrossCents: number[], discountCents: number): number[] {
  const subtotal = lineGrossCents.reduce((sum, value) => sum + value, 0);
  if (discountCents < 0 || discountCents > subtotal || (discountCents > 0 && subtotal <= 0)) throw new SaleExchangeError("The discount cannot exceed the replacement sale subtotal.");
  if (discountCents === 0) return lineGrossCents.map(() => 0);
  const rows = lineGrossCents.map((grossCents, index) => {
    const numerator = new Decimal(discountCents).mul(grossCents);
    return { index, grossCents, base: Number(numerator.dividedToIntegerBy(subtotal).toString()), remainder: numerator.mod(subtotal) };
  });
  const result = rows.map((row) => row.base);
  let remaining = discountCents - result.reduce((sum, value) => sum + value, 0);
  for (const row of [...rows].sort((a, b) => b.remainder.comparedTo(a.remainder) || a.index - b.index)) {
    if (remaining <= 0) break;
    if (result[row.index] < row.grossCents) { result[row.index] += 1; remaining -= 1; }
  }
  if (remaining !== 0) throw new SaleExchangeError("The replacement sale discount could not be allocated exactly.");
  return result;
}

export async function getSaleExchangeScreenDataForShop(shopId: string, saleId: string) {
  if (!UUID_PATTERN.test(saleId)) return null;
  const [original, pos] = await Promise.all([
    getSaleReturnScreenDataForShop(shopId, saleId),
    getPosScreenDataForShop(shopId),
  ]);
  if (!original) return null;
  const returnableItems = original.items.filter((item) => item.remainingQuantity > 0);
  return { original, returnableItems, catalog: pos.catalog, devices: pos.devices, paymentAccounts: pos.paymentAccounts, customers: pos.customers };
}

export async function createSaleExchangeForShop(input: {
  shopId: string;
  createdBy: string;
  originalSaleId: string;
  reason: string;
  returnItemsJson: string;
  cartJson: string;
  discountAmount: string;
  paymentAllocationsJson: string;
  customerId: string;
  allowCreditBalance: boolean;
}) {
  if (!UUID_PATTERN.test(input.originalSaleId)) throw new SaleExchangeError("The original sale reference is invalid.");
  const returnItems = parseReturnItems(input.returnItemsJson);
  const cart = parseCart(input.cartJson);
  const discountCents = cents(parseMoney(input.discountAmount.trim() || "0", "Replacement sale discount"));
  const payments = parsePayments(input.paymentAllocationsJson);
  const reason = input.reason.trim();
  if (reason.length > 500) throw new SaleExchangeError("Exchange reason must be 500 characters or fewer.");
  const customerInput = input.customerId.trim();
  if (customerInput && !UUID_PATTERN.test(customerInput)) throw new SaleExchangeError("Select a valid customer for the replacement sale.");

  const seenVariant = new Set<string>();
  const seenDevices = new Set<string>();
  for (const line of cart) {
    if (line.imeiDeviceId) {
      if (line.quantity !== 1) throw new SaleExchangeError("Each IMEI-tracked replacement phone must be a separate quantity-one line.");
      if (seenDevices.has(line.imeiDeviceId)) throw new SaleExchangeError("The same IMEI device cannot be selected twice.");
      seenDevices.add(line.imeiDeviceId);
    } else {
      if (seenVariant.has(line.variantId)) throw new SaleExchangeError("A quantity-tracked variant can appear only once in the replacement cart. Combine its quantity into one line.");
      seenVariant.add(line.variantId);
    }
  }

  return db.transaction(async (tx) => {
    const [originalSale] = await tx.select({ id: sales.id, documentNo: sales.documentNo, status: sales.status, totalAmount: sales.totalAmount, customerId: sales.customerId })
      .from(sales).where(and(eq(sales.shopId, input.shopId), eq(sales.id, input.originalSaleId))).for("update");
    if (!originalSale) throw new SaleExchangeError("The original sale was not found in this shop.");
    if (originalSale.status !== "COMPLETED") throw new SaleExchangeError("Only completed sales can be exchanged.");

    const [oldItems, oldPayments, previousReturnRows, priorExchangeCreditRow] = await Promise.all([
      tx.select({ id: saleItems.id, variantId: saleItems.variantId, imeiDeviceId: saleItems.imeiDeviceId, description: saleItems.descriptionSnapshot, quantity: saleItems.quantity, lineTotal: saleItems.lineTotal, costSnapshot: saleItems.costSnapshot })
        .from(saleItems).where(and(eq(saleItems.shopId, input.shopId), eq(saleItems.saleId, originalSale.id))).orderBy(asc(saleItems.id)).for("update"),
      tx.select({ total: sql<string>`COALESCE(SUM(${salePayments.amount}::numeric), 0)::text` }).from(salePayments).where(and(eq(salePayments.shopId, input.shopId), eq(salePayments.saleId, originalSale.id))),
      tx.select({ saleItemId: saleReturnItems.saleItemId, quantity: saleReturnItems.quantity, amount: saleReturnItems.amount })
        .from(saleReturnItems).innerJoin(saleReturns, and(eq(saleReturns.shopId, saleReturnItems.shopId), eq(saleReturns.id, saleReturnItems.returnId)))
        .where(and(eq(saleReturnItems.shopId, input.shopId), eq(saleReturns.originalSaleId, originalSale.id), eq(saleReturns.status, "COMPLETED"))),
      tx.select({ total: sql<string>`COALESCE(SUM(${saleReturnItems.amount}::numeric), 0)::text` })
        .from(saleReturnItems).innerJoin(saleReturns, and(eq(saleReturns.shopId, saleReturnItems.shopId), eq(saleReturns.id, saleReturnItems.returnId)))
        .where(and(eq(saleReturnItems.shopId, input.shopId), eq(saleReturns.replacementSaleId, originalSale.id), eq(saleReturns.status, "COMPLETED"))),
    ]);
    const alreadyReturnedQty = new Map<string, number>();
    let priorReturnCents = 0;
    for (const row of previousReturnRows) {
      alreadyReturnedQty.set(row.saleItemId, (alreadyReturnedQty.get(row.saleItemId) ?? 0) + row.quantity);
      priorReturnCents += cents(row.amount);
    }
    const originalOutstanding = Math.max(0, cents(originalSale.totalAmount) - cents(oldPayments[0]?.total ?? "0") - priorReturnCents - cents(priorExchangeCreditRow[0]?.total ?? "0"));
    if (originalOutstanding > 0) throw new SaleExchangeError(`The original sale still has Rs ${moneyFromCents(originalOutstanding)} outstanding. Collect or reconcile that balance first; use a normal return if the return is intended to reduce the debt.`);

    const oldItemById = new Map(oldItems.map((item) => [item.id, item]));
    const seenReturnIds = new Set<string>();
    const preparedReturn = returnItems.map((requested) => {
      const original = oldItemById.get(requested.saleItemId);
      if (!original) throw new SaleExchangeError("One or more selected return items do not belong to the original sale.");
      if (seenReturnIds.has(original.id)) throw new SaleExchangeError("A return item was selected more than once.");
      seenReturnIds.add(original.id);
      const alreadyReturned = alreadyReturnedQty.get(original.id) ?? 0;
      const remaining = original.quantity - alreadyReturned;
      if (remaining <= 0 || requested.quantity > remaining) throw new SaleExchangeError(`${original.description} has only ${Math.max(0, remaining)} item(s) remaining for return.`);
      if (original.imeiDeviceId && requested.quantity !== 1) throw new SaleExchangeError(`The IMEI-tracked item ${original.description} must be returned one device at a time.`);
      const amountCents = valueForUnits(cents(original.lineTotal), original.quantity, alreadyReturned, requested.quantity);
      return { ...requested, original, amountCents, costCents: cents(original.costSnapshot) * requested.quantity };
    });
    const returnValueCents = preparedReturn.reduce((total, item) => total + item.amountCents, 0);
    if (returnValueCents <= 0) throw new SaleExchangeError("The selected return has no monetary value, so it cannot be used as exchange credit.");

    const returnQtyByVariant = new Map<string, number>();
    const restockCostByVariant = new Map<string, Decimal>();
    for (const item of preparedReturn) {
      if (item.condition !== "RESTOCK") continue;
      returnQtyByVariant.set(item.original.variantId, (returnQtyByVariant.get(item.original.variantId) ?? 0) + item.quantity);
      restockCostByVariant.set(item.original.variantId, (restockCostByVariant.get(item.original.variantId) ?? new Decimal(0)).plus(new Decimal(item.original.costSnapshot).mul(item.quantity)));
    }
    const restockCostCents = [...restockCostByVariant.values()].reduce((sum, value) => sum + cents(value), 0);

    const replacementVariantIds = [...new Set(cart.map((line) => line.variantId))].sort();
    const variants = await tx.select({ id: productVariants.id, productId: products.id, productName: products.name, variantName: productVariants.name, sku: productVariants.sku, sellingPrice: productVariants.sellingPrice, trackByImei: productVariants.trackByImei, productActive: products.active, variantActive: productVariants.active })
      .from(productVariants).innerJoin(products, and(eq(products.id, productVariants.productId), eq(products.shopId, productVariants.shopId)))
      .where(and(eq(productVariants.shopId, input.shopId), inArray(productVariants.id, replacementVariantIds))).orderBy(asc(productVariants.id)).for("update");
    if (variants.length !== replacementVariantIds.length || variants.some((variant) => !variant.productActive || !variant.variantActive)) throw new SaleExchangeError("One or more replacement products are inactive or no longer available. Refresh and try again.");
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    for (const line of cart) {
      const variant = variantById.get(line.variantId);
      if (!variant) throw new SaleExchangeError("A replacement product could not be found.");
      if (variant.trackByImei && !line.imeiDeviceId) throw new SaleExchangeError(`${variant.productName} (${variant.variantName}) requires a specific IMEI device.`);
      if (!variant.trackByImei && line.imeiDeviceId) throw new SaleExchangeError(`${variant.productName} (${variant.variantName}) does not use IMEI tracking.`);
    }

    const balanceVariantIds = [...new Set([...replacementVariantIds, ...returnQtyByVariant.keys()])].sort();
    const balanceRows = await tx.select({ id: inventoryBalances.id, variantId: inventoryBalances.variantId, quantity: inventoryBalances.quantity, averageCost: inventoryBalances.averageCost })
      .from(inventoryBalances).where(and(eq(inventoryBalances.shopId, input.shopId), inArray(inventoryBalances.variantId, balanceVariantIds))).orderBy(asc(inventoryBalances.variantId)).for("update");
    if (balanceRows.length !== balanceVariantIds.length) throw new SaleExchangeError("An inventory balance row is missing for an exchange item. No changes were posted.");
    const balanceByVariant = new Map(balanceRows.map((row) => [row.variantId, row]));
    const averageCostAfterReturn = new Map<string, Decimal>();
    for (const balance of balanceRows) {
      const addQuantity = returnQtyByVariant.get(balance.variantId) ?? 0;
      const addCost = restockCostByVariant.get(balance.variantId) ?? new Decimal(0);
      const beforeValue = new Decimal(balance.averageCost).mul(balance.quantity);
      const totalQty = balance.quantity + addQuantity;
      const average = totalQty > 0 ? beforeValue.plus(addCost).div(totalQty).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : new Decimal(balance.averageCost);
      averageCostAfterReturn.set(balance.variantId, average);
    }

    const replacementQtyByVariant = new Map<string, number>();
    for (const line of cart) replacementQtyByVariant.set(line.variantId, (replacementQtyByVariant.get(line.variantId) ?? 0) + line.quantity);
    for (const [variantId, quantity] of replacementQtyByVariant) {
      const balance = balanceByVariant.get(variantId)!;
      const available = balance.quantity + (returnQtyByVariant.get(variantId) ?? 0);
      if (available < quantity) {
        const variant = variantById.get(variantId)!;
        throw new SaleExchangeError(`Insufficient stock for replacement ${variant.productName} (${variant.variantName}). Available after RESTOCK items: ${available}; requested: ${quantity}.`);
      }
    }

    const returnedDeviceIds = new Set(preparedReturn.map((item) => item.original.imeiDeviceId).filter((id): id is string => id !== null));
    for (const id of seenDevices) if (returnedDeviceIds.has(id)) throw new SaleExchangeError("A device returned from the original sale cannot be selected as a replacement device in the same exchange.");
    const deviceRows = seenDevices.size > 0 ? await tx.select({ id: imeiDevices.id, variantId: imeiDevices.variantId, imei1: imeiDevices.imei1, purchaseCost: imeiDevices.purchaseCost })
      .from(imeiDevices).where(and(eq(imeiDevices.shopId, input.shopId), eq(imeiDevices.status, "IN_STOCK"), inArray(imeiDevices.id, [...seenDevices]))).orderBy(asc(imeiDevices.id)).for("update") : [];
    if (deviceRows.length !== seenDevices.size) throw new SaleExchangeError("One or more selected replacement phones are no longer in stock.");
    const deviceById = new Map(deviceRows.map((row) => [row.id, row]));
    for (const line of cart) if (line.imeiDeviceId && deviceById.get(line.imeiDeviceId)?.variantId !== line.variantId) throw new SaleExchangeError("A selected replacement IMEI does not match the chosen variant.");

    const preparedSale = cart.map((line) => {
      const variant = variantById.get(line.variantId)!;
      const device = line.imeiDeviceId ? deviceById.get(line.imeiDeviceId) : undefined;
      const avg = averageCostAfterReturn.get(line.variantId) ?? new Decimal(balanceByVariant.get(line.variantId)!.averageCost);
      const unitCost = device ? new Decimal(device.purchaseCost) : avg;
      const grossCents = cents(new Decimal(variant.sellingPrice).mul(line.quantity));
      return { ...line, description: `${variant.productName} — ${variant.variantName}`, sku: variant.sku, unitPrice: new Decimal(variant.sellingPrice), unitCost, grossCents, lineTotalCents: grossCents, discountCents: 0 };
    });
    const subtotalCents = preparedSale.reduce((sum, line) => sum + line.grossCents, 0);
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents > cents(MAX_MONEY)) throw new SaleExchangeError("Replacement sale subtotal is outside the supported amount.");
    if (discountCents > subtotalCents) throw new SaleExchangeError("The discount cannot exceed the replacement sale subtotal.");
    const discountAllocations = allocateDiscount(preparedSale.map((line) => line.grossCents), discountCents);
    preparedSale.forEach((line, index) => { line.discountCents = discountAllocations[index]; line.lineTotalCents = line.grossCents - discountAllocations[index]; });
    const saleTotalCents = subtotalCents - discountCents;
    if (saleTotalCents <= 0) throw new SaleExchangeError("The replacement sale total must be greater than Rs 0.00.");
    if (saleTotalCents < returnValueCents) throw new SaleExchangeError(`The replacement sale total (Rs ${moneyFromCents(saleTotalCents)}) must be at least the exchange credit (Rs ${moneyFromCents(returnValueCents)}). For a lower-priced replacement, process a normal return/refund and then a separate sale.`);
    const saleCogsCents = preparedSale.reduce((sum, line) => sum + cents(line.unitCost.mul(line.quantity)), 0);
    if (!Number.isSafeInteger(saleCogsCents) || saleCogsCents > cents(MAX_MONEY)) throw new SaleExchangeError("Replacement cost of goods sold is outside the supported amount.");

    const paymentTotalCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    const amountDueAfterExchangeCents = saleTotalCents - returnValueCents;
    if (paymentTotalCents > amountDueAfterExchangeCents) throw new SaleExchangeError(`Payments cannot exceed the replacement total after exchange credit of Rs ${moneyFromCents(amountDueAfterExchangeCents)}.`);
    const outstandingCents = amountDueAfterExchangeCents - paymentTotalCents;
    if (outstandingCents > 0 && !input.allowCreditBalance) throw new SaleExchangeError(`Payments must equal Rs ${moneyFromCents(amountDueAfterExchangeCents)} after exchange credit unless customer credit is enabled.`);

    const customerId = customerInput || originalSale.customerId || "";
    if (originalSale.customerId && customerId !== originalSale.customerId) throw new SaleExchangeError("An exchange must remain with the customer on the original sale. Select that customer to continue.");
    if (outstandingCents > 0 && !customerId) throw new SaleExchangeError("Select a customer before leaving an outstanding balance on the replacement sale.");
    let customerName: string | null = null;
    if (customerId) {
      const [customer] = await tx.select({ id: customers.id, name: customers.name }).from(customers)
        .where(and(eq(customers.shopId, input.shopId), eq(customers.id, customerId), eq(customers.active, true))).for("update");
      if (!customer) throw new SaleExchangeError("The selected customer is inactive or does not belong to this shop.");
      customerName = customer.name;
    }

    const paymentAccountIds = payments.map((payment) => payment.financialAccountId).sort();
    const paymentAccounts = paymentAccountIds.length > 0 ? await tx.select({ id: financialAccounts.id, name: financialAccounts.name, ledgerAccountId: ledgerAccounts.id, accountType: ledgerAccounts.accountType, normalBalance: ledgerAccounts.normalBalance, ledgerActive: ledgerAccounts.active, isActive: financialAccounts.isActive })
      .from(financialAccounts).innerJoin(ledgerAccounts, and(eq(ledgerAccounts.id, financialAccounts.ledgerAccountId), eq(ledgerAccounts.shopId, financialAccounts.shopId)))
      .where(and(eq(financialAccounts.shopId, input.shopId), inArray(financialAccounts.id, paymentAccountIds))).orderBy(asc(financialAccounts.id)).for("update") : [];
    if (paymentAccounts.length !== paymentAccountIds.length) throw new SaleExchangeError("One or more payment accounts do not exist in this shop.");
    if (paymentAccounts.some((account) => !account.isActive || !account.ledgerActive || account.accountType !== "ASSET" || account.normalBalance !== "DEBIT")) throw new SaleExchangeError("All payment accounts must be active debit-balance assets.");
    const paymentAccountById = new Map(paymentAccounts.map((account) => [account.id, account]));

    // Lazily create the dedicated liability/clearing account for existing shops.
    // It is never a cash account; its credit in the return journal is consumed by the replacement sale journal below.
    let [exchangeClearing] = await tx.select().from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, input.shopId), eq(ledgerAccounts.code, "2100"))).for("update");
    if (!exchangeClearing) {
      await tx.insert(ledgerAccounts).values({ shopId: input.shopId, code: "2100", name: "Customer Exchange Clearing", accountType: "LIABILITY", normalBalance: "CREDIT", systemKey: "customer_exchange_clearing", isSystem: true, active: true }).onConflictDoNothing();
      [exchangeClearing] = await tx.select().from(ledgerAccounts)
        .where(and(eq(ledgerAccounts.shopId, input.shopId), eq(ledgerAccounts.code, "2100"))).for("update");
    }
    if (!exchangeClearing || exchangeClearing.name !== "Customer Exchange Clearing" || exchangeClearing.accountType !== "LIABILITY" || exchangeClearing.normalBalance !== "CREDIT" || !exchangeClearing.active) throw new SaleExchangeError("Ledger account code 2100 must be active and configured as Customer Exchange Clearing (LIABILITY/CREDIT). Resolve the chart-of-accounts conflict before exchanging items.");

    const requiredCodes = ["4000", "4900", "2100", ...(outstandingCents > 0 ? ["1300"] : []), ...((restockCostCents > 0 || saleCogsCents > 0) ? ["1200", "5000"] : [])];
    const systemRows = await tx.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, input.shopId), inArray(ledgerAccounts.code, [...new Set(requiredCodes)]), eq(ledgerAccounts.active, true))).for("update");
    const accountByCode = new Map(systemRows.map((row) => [row.code, row]));
    const salesLedger = accountByCode.get("4000");
    const returnsLedger = accountByCode.get("4900");
    const clearingLedger = accountByCode.get("2100");
    const receivableLedger = accountByCode.get("1300");
    const inventoryLedger = accountByCode.get("1200");
    const cogsLedger = accountByCode.get("5000");
    if (!salesLedger || salesLedger.accountType !== "REVENUE" || salesLedger.normalBalance !== "CREDIT" || !returnsLedger || returnsLedger.accountType !== "REVENUE" || returnsLedger.normalBalance !== "DEBIT" || !clearingLedger || clearingLedger.accountType !== "LIABILITY" || clearingLedger.normalBalance !== "CREDIT") throw new SaleExchangeError("Product Sales (4000), Sales Returns (4900), or Customer Exchange Clearing (2100) is missing or incorrectly configured.");
    if (outstandingCents > 0 && (!receivableLedger || receivableLedger.accountType !== "ASSET" || receivableLedger.normalBalance !== "DEBIT")) throw new SaleExchangeError("Accounts Receivable (1300) is missing or incorrectly configured.");
    if ((restockCostCents > 0 || saleCogsCents > 0) && (!inventoryLedger || inventoryLedger.accountType !== "ASSET" || inventoryLedger.normalBalance !== "DEBIT" || !cogsLedger || cogsLedger.accountType !== "EXPENSE" || cogsLedger.normalBalance !== "DEBIT")) throw new SaleExchangeError("Inventory (1200) or COGS (5000) is missing or incorrectly configured.");

    const postingIds = [...paymentAccounts.map((row) => row.ledgerAccountId), salesLedger.id, returnsLedger.id, clearingLedger.id,
      ...(receivableLedger && outstandingCents > 0 ? [receivableLedger.id] : []),
      ...(inventoryLedger && cogsLedger && (restockCostCents > 0 || saleCogsCents > 0) ? [inventoryLedger.id, cogsLedger.id] : [])];
    const children = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, input.shopId), inArray(ledgerAccounts.parentId, postingIds))).limit(1);
    if (children.length > 0) throw new SaleExchangeError("An exchange journal cannot post to parent ledger accounts. Use leaf payment/system accounts.");

    const year = pakistanYear();
    const [{ lastValue: saleSequence }] = await tx.insert(documentSequences).values({ shopId: input.shopId, documentType: "SALE", year, lastValue: 1 })
      .onConflictDoUpdate({ target: [documentSequences.shopId, documentSequences.documentType, documentSequences.year], set: { lastValue: sql`${documentSequences.lastValue} + 1` } })
      .returning({ lastValue: documentSequences.lastValue });
    const saleDocumentNo = `SAL-${year}-${String(saleSequence).padStart(6, "0")}`;

    const [replacementSale] = await tx.insert(sales).values({ shopId: input.shopId, documentNo: saleDocumentNo, customerId: customerId || null, status: "COMPLETED", subtotal: moneyFromCents(subtotalCents), discountAmount: moneyFromCents(discountCents), totalAmount: moneyFromCents(saleTotalCents), createdBy: input.createdBy, completedAt: new Date() }).returning({ id: sales.id, documentNo: sales.documentNo });

    const { year: returnYear } = pakistanDateParts();
    const [{ lastValue: returnSequence }] = await tx.insert(documentSequences).values({ shopId: input.shopId, documentType: "SALE_RETURN", year: returnYear, lastValue: 1 })
      .onConflictDoUpdate({ target: [documentSequences.shopId, documentSequences.documentType, documentSequences.year], set: { lastValue: sql`${documentSequences.lastValue} + 1` } })
      .returning({ lastValue: documentSequences.lastValue });
    const returnDocumentNo = `RET-${returnYear}-${String(returnSequence).padStart(6, "0")}`;
    const [returnHeader] = await tx.insert(saleReturns).values({ shopId: input.shopId, documentNo: returnDocumentNo, originalSaleId: originalSale.id, replacementSaleId: replacementSale.id, status: "COMPLETED", reason: reason || `Exchange for ${replacementSale.documentNo}`, refundAmount: "0.00", createdBy: input.createdBy, completedAt: new Date() }).returning({ id: saleReturns.id });
    const returnedRecords = await tx.insert(saleReturnItems).values(preparedReturn.map((item) => ({ shopId: input.shopId, returnId: returnHeader.id, saleItemId: item.original.id, imeiDeviceId: item.original.imeiDeviceId, quantity: item.quantity, amount: moneyFromCents(item.amountCents), condition: item.condition }))).returning({ id: saleReturnItems.id, saleItemId: saleReturnItems.saleItemId });

    const replacementRecords: Array<{ id: string; line: (typeof preparedSale)[number] }> = [];
    for (const line of preparedSale) {
      const [saved] = await tx.insert(saleItems).values({ shopId: input.shopId, saleId: replacementSale.id, variantId: line.variantId, imeiDeviceId: line.imeiDeviceId, descriptionSnapshot: line.description, quantity: line.quantity, unitPrice: line.unitPrice.toFixed(2), discountAmount: moneyFromCents(line.discountCents), lineTotal: moneyFromCents(line.lineTotalCents), costSnapshot: line.unitCost.toFixed(2) }).returning({ id: saleItems.id });
      replacementRecords.push({ id: saved.id, line });
    }

    // Write the final balance once per affected variant. Returned RESTOCK items are available to the replacement sale within this same exchange.
    for (const variantId of balanceVariantIds) {
      const originalBalance = balanceByVariant.get(variantId)!;
      const finalQty = originalBalance.quantity + (returnQtyByVariant.get(variantId) ?? 0) - (replacementQtyByVariant.get(variantId) ?? 0);
      if (finalQty < 0) throw new SaleExchangeError("Inventory changed during exchange validation. No exchange was committed; refresh stock and retry.");
      const average = averageCostAfterReturn.get(variantId) ?? new Decimal(originalBalance.averageCost);
      const [updated] = await tx.update(inventoryBalances).set({ quantity: finalQty, averageCost: average.toFixed(2), updatedAt: new Date() })
        .where(and(eq(inventoryBalances.shopId, input.shopId), eq(inventoryBalances.variantId, variantId), sql`${inventoryBalances.quantity} + ${returnQtyByVariant.get(variantId) ?? 0} >= ${replacementQtyByVariant.get(variantId) ?? 0}`))
        .returning({ id: inventoryBalances.id });
      if (!updated) throw new SaleExchangeError("Stock changed while completing the exchange. No exchange was committed; refresh and try again.");
    }

    const returnItemIdBySaleItem = new Map(returnedRecords.map((row) => [row.saleItemId, row.id]));
    for (const item of preparedReturn) {
      if (item.original.imeiDeviceId) {
        const newStatus = item.condition === "RESTOCK" ? "IN_STOCK" : item.condition === "DAMAGED" ? "DAMAGED" : "RETURNED";
        const [updated] = await tx.update(imeiDevices).set({ status: newStatus, updatedAt: new Date() }).where(and(eq(imeiDevices.shopId, input.shopId), eq(imeiDevices.id, item.original.imeiDeviceId), eq(imeiDevices.status, "SOLD"))).returning({ id: imeiDevices.id });
        if (!updated) throw new SaleExchangeError("An original IMEI device status changed during exchange. No exchange was committed.");
      }
      if (item.condition === "RESTOCK") await tx.insert(inventoryMovements).values({ shopId: input.shopId, variantId: item.original.variantId, imeiDeviceId: item.original.imeiDeviceId, quantityDelta: item.quantity, movementType: "RETURN", unitCost: item.original.costSnapshot, referenceType: "SALE_RETURN_ITEM", referenceId: returnItemIdBySaleItem.get(item.original.id)!, note: `Restocked under exchange ${returnDocumentNo} from ${originalSale.documentNo}`, createdBy: input.createdBy });
    }
    for (const item of replacementRecords) await tx.insert(inventoryMovements).values({ shopId: input.shopId, variantId: item.line.variantId, imeiDeviceId: item.line.imeiDeviceId, quantityDelta: -item.line.quantity, movementType: "SALE", unitCost: item.line.unitCost.toFixed(2), referenceType: "SALE_ITEM", referenceId: item.id, note: `Sold as replacement under exchange ${returnDocumentNo}: ${replacementSale.documentNo}`, createdBy: input.createdBy });
    if (seenDevices.size > 0) {
      const updated = await tx.update(imeiDevices).set({ status: "SOLD", updatedAt: new Date() }).where(and(eq(imeiDevices.shopId, input.shopId), eq(imeiDevices.status, "IN_STOCK"), inArray(imeiDevices.id, [...seenDevices]))).returning({ id: imeiDevices.id });
      if (updated.length !== seenDevices.size) throw new SaleExchangeError("A replacement IMEI was sold by another checkout. No exchange was committed; refresh and try again.");
    }
    if (payments.length > 0) await tx.insert(salePayments).values(payments.map((payment) => ({ shopId: input.shopId, saleId: replacementSale.id, financialAccountId: payment.financialAccountId, amount: moneyFromCents(payment.amountCents), createdBy: input.createdBy })));

    const returnJournalLines: Array<{ ledgerAccountId: string; debit: string; credit: string; description: string }> = [
      { ledgerAccountId: returnsLedger.id, debit: moneyFromCents(returnValueCents), credit: "0.00", description: `Exchange return ${returnDocumentNo} from ${originalSale.documentNo}` },
      { ledgerAccountId: clearingLedger.id, debit: "0.00", credit: moneyFromCents(returnValueCents), description: `Exchange credit issued for ${replacementSale.documentNo}` },
    ];
    if (restockCostCents > 0 && inventoryLedger && cogsLedger) returnJournalLines.push(
      { ledgerAccountId: inventoryLedger.id, debit: moneyFromCents(restockCostCents), credit: "0.00", description: `Restocked returned goods cost - ${returnDocumentNo}` },
      { ledgerAccountId: cogsLedger.id, debit: "0.00", credit: moneyFromCents(restockCostCents), description: `Reverse COGS for exchanged goods - ${returnDocumentNo}` },
    );
    const returnDebit = returnJournalLines.reduce((sum, line) => sum.plus(line.debit), new Decimal(0));
    const returnCredit = returnJournalLines.reduce((sum, line) => sum.plus(line.credit), new Decimal(0));
    if (!returnDebit.equals(returnCredit)) throw new SaleExchangeError("The exchange return journal is not balanced; no changes were committed.");
    const [returnJournal] = await tx.insert(ledgerTransactions).values({ shopId: input.shopId, referenceType: "SALE_EXCHANGE_RETURN", referenceId: returnHeader.id, description: `Exchange return completed: ${returnDocumentNo}`, createdBy: input.createdBy }).returning({ id: ledgerTransactions.id });
    await tx.insert(ledgerEntries).values(returnJournalLines.map((line) => ({ shopId: input.shopId, ledgerTransactionId: returnJournal.id, ...line })));

    const saleJournalLines: Array<{ ledgerAccountId: string; debit: string; credit: string; description: string }> = [
      { ledgerAccountId: clearingLedger.id, debit: moneyFromCents(returnValueCents), credit: "0.00", description: `Exchange credit applied from ${returnDocumentNo}` },
      ...payments.map((payment, index) => ({ ledgerAccountId: paymentAccountById.get(payment.financialAccountId)!.ledgerAccountId, debit: moneyFromCents(payment.amountCents), credit: "0.00", description: `Exchange difference payment ${index + 1} received into ${paymentAccountById.get(payment.financialAccountId)!.name} - ${replacementSale.documentNo}` })),
      ...(outstandingCents > 0 && receivableLedger ? [{ ledgerAccountId: receivableLedger.id, debit: moneyFromCents(outstandingCents), credit: "0.00", description: `Customer receivable for exchange replacement - ${replacementSale.documentNo}` }] : []),
      { ledgerAccountId: salesLedger.id, debit: "0.00", credit: moneyFromCents(saleTotalCents), description: `Replacement product sale - ${replacementSale.documentNo}` },
    ];
    if (saleCogsCents > 0 && inventoryLedger && cogsLedger) saleJournalLines.push(
      { ledgerAccountId: cogsLedger.id, debit: moneyFromCents(saleCogsCents), credit: "0.00", description: `Replacement goods cost of goods sold - ${replacementSale.documentNo}` },
      { ledgerAccountId: inventoryLedger.id, debit: "0.00", credit: moneyFromCents(saleCogsCents), description: `Replacement sale inventory relieved - ${replacementSale.documentNo}` },
    );
    const saleDebit = saleJournalLines.reduce((sum, line) => sum.plus(line.debit), new Decimal(0));
    const saleCredit = saleJournalLines.reduce((sum, line) => sum.plus(line.credit), new Decimal(0));
    if (!saleDebit.equals(saleCredit)) throw new SaleExchangeError("The replacement sale journal is not balanced; no changes were committed.");
    const [saleJournal] = await tx.insert(ledgerTransactions).values({ shopId: input.shopId, referenceType: "SALE_EXCHANGE_REPLACEMENT", referenceId: replacementSale.id, description: `Replacement sale completed: ${replacementSale.documentNo} for ${returnDocumentNo}`, createdBy: input.createdBy }).returning({ id: ledgerTransactions.id });
    await tx.insert(ledgerEntries).values(saleJournalLines.map((line) => ({ shopId: input.shopId, ledgerTransactionId: saleJournal.id, ...line })));

    await tx.insert(auditLogs).values([
      { shopId: input.shopId, actorUserId: input.createdBy, action: "SALE_EXCHANGE_COMPLETED", entityType: "SALE_RETURN", entityId: returnHeader.id, metadata: { returnDocumentNo, replacementSaleId: replacementSale.id, replacementSaleDocumentNo: replacementSale.documentNo, originalSaleId: originalSale.id, originalSaleDocumentNo: originalSale.documentNo, exchangeValue: moneyFromCents(returnValueCents), replacementSaleTotal: moneyFromCents(saleTotalCents), cashReceived: moneyFromCents(paymentTotalCents), outstandingAfterExchange: moneyFromCents(outstandingCents), restockCostReversed: moneyFromCents(restockCostCents), items: preparedReturn.map((item) => ({ saleItemId: item.original.id, description: item.original.description, quantity: item.quantity, condition: item.condition, amount: moneyFromCents(item.amountCents) })) } },
      { shopId: input.shopId, actorUserId: input.createdBy, action: "SALE_COMPLETED_AS_EXCHANGE_REPLACEMENT", entityType: "SALE", entityId: replacementSale.id, metadata: { documentNo: replacementSale.documentNo, linkedReturnId: returnHeader.id, returnDocumentNo, originalSaleId: originalSale.id, exchangeCredit: moneyFromCents(returnValueCents), subtotal: moneyFromCents(subtotalCents), discountAmount: moneyFromCents(discountCents), totalAmount: moneyFromCents(saleTotalCents), customerId: customerId || null, customerName, payments: payments.map((payment) => ({ financialAccountId: payment.financialAccountId, accountName: paymentAccountById.get(payment.financialAccountId)?.name, amount: moneyFromCents(payment.amountCents) })), outstandingAmount: moneyFromCents(outstandingCents), costOfGoodsSold: moneyFromCents(saleCogsCents) } },
    ]);

    return {
      returnId: returnHeader.id,
      returnDocumentNo,
      replacementSaleId: replacementSale.id,
      replacementSaleDocumentNo: replacementSale.documentNo,
      originalSaleDocumentNo: originalSale.documentNo,
      exchangeValue: moneyFromCents(returnValueCents),
      replacementSaleTotal: moneyFromCents(saleTotalCents),
      cashReceived: moneyFromCents(paymentTotalCents),
      outstandingAmount: moneyFromCents(outstandingCents),
      customerId: customerId || null,
      restockCostReversed: moneyFromCents(restockCostCents),
    };
  });
}
