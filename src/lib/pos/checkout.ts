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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MONEY = new Decimal("999999999999.99");
const MAX_SALE_LINES = 100;
const MAX_QUANTITY_PER_LINE = 999;
const MAX_PAYMENT_SPLITS = 10;

type CartLineInput = {
  variantId: string;
  quantity: number;
  imeiDeviceId: string | null;
};

type PaymentAllocationInput = {
  financialAccountId: string;
  amount: Decimal;
  amountCents: number;
};

type PreparedSaleLine = CartLineInput & {
  description: string;
  sku: string;
  trackByImei: boolean;
  unitPrice: Decimal;
  unitCost: Decimal;
  grossCents: number;
  discountCents: number;
  lineTotalCents: number;
};

export class PosCheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosCheckoutError";
  }
}

function parseMoney(value: string, label: string): Decimal {
  const normalized = value.trim();
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new PosCheckoutError(`${label} must be a valid amount with up to two decimal places.`);
  }

  const amount = new Decimal(normalized);
  if (!amount.isFinite() || amount.isNegative() || amount.greaterThan(MAX_MONEY)) {
    throw new PosCheckoutError(`${label} is outside the supported range.`);
  }
  return amount;
}

function cents(value: Decimal | string | number): number {
  return new Decimal(value).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function moneyFromCents(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PosCheckoutError("A calculated sale amount is outside the supported range.");
  }
  return new Decimal(value).div(100).toFixed(2);
}

function parseCart(raw: string): CartLineInput[] {
  let parsed: unknown;
  try {
    if (!raw || raw.length > 100_000) throw new Error("invalid length");
    parsed = JSON.parse(raw);
  } catch {
    throw new PosCheckoutError("The cart data is invalid. Refresh the page and rebuild the cart.");
  }

  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_SALE_LINES) {
    throw new PosCheckoutError(`Add between 1 and ${MAX_SALE_LINES} cart line(s).`);
  }

  return parsed.map((value, index) => {
    if (!value || typeof value !== "object") {
      throw new PosCheckoutError(`Cart line ${index + 1} is invalid.`);
    }
    const row = value as Record<string, unknown>;
    const variantId = typeof row.variantId === "string" ? row.variantId.trim() : "";
    const quantity = row.quantity;
    const imeiDeviceId = row.imeiDeviceId === null || row.imeiDeviceId === undefined || row.imeiDeviceId === ""
      ? null
      : typeof row.imeiDeviceId === "string"
        ? row.imeiDeviceId.trim()
        : "invalid";

    if (!UUID_PATTERN.test(variantId)) {
      throw new PosCheckoutError(`Cart line ${index + 1} has an invalid product variant.`);
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
      throw new PosCheckoutError(`Cart line ${index + 1} quantity must be a whole number from 1 to ${MAX_QUANTITY_PER_LINE}.`);
    }
    if (imeiDeviceId === "invalid" || (imeiDeviceId && !UUID_PATTERN.test(imeiDeviceId))) {
      throw new PosCheckoutError(`Cart line ${index + 1} has an invalid device selection.`);
    }

    return {
      variantId,
      quantity: Number(quantity),
      imeiDeviceId,
    };
  });
}

function parsePaymentAllocations(raw: string): PaymentAllocationInput[] {
  let parsed: unknown;
  try {
    if (!raw || raw.length > 20_000) throw new Error("invalid length");
    parsed = JSON.parse(raw);
  } catch {
    throw new PosCheckoutError("Payment allocations are invalid. Refresh the POS and try again.");
  }

  if (!Array.isArray(parsed) || parsed.length > MAX_PAYMENT_SPLITS) {
    throw new PosCheckoutError(`Use no more than ${MAX_PAYMENT_SPLITS} payment account(s).`);
  }

  const seenAccounts = new Set<string>();
  return parsed.map((value, index) => {
    if (!value || typeof value !== "object") {
      throw new PosCheckoutError(`Payment ${index + 1} is invalid.`);
    }
    const row = value as Record<string, unknown>;
    const financialAccountId = typeof row.financialAccountId === "string" ? row.financialAccountId.trim() : "";
    const amountText = typeof row.amount === "string" ? row.amount.trim() : "";
    if (!UUID_PATTERN.test(financialAccountId)) {
      throw new PosCheckoutError(`Select a valid financial account for payment ${index + 1}.`);
    }
    if (seenAccounts.has(financialAccountId)) {
      throw new PosCheckoutError("Choose each payment account only once. Combine amounts for the same account into one row.");
    }
    seenAccounts.add(financialAccountId);

    const amount = parseMoney(amountText, `Payment ${index + 1}`);
    const amountCents = cents(amount);
    if (amountCents <= 0) {
      throw new PosCheckoutError(`Payment ${index + 1} must be greater than Rs 0.00.`);
    }
    return { financialAccountId, amount, amountCents };
  });
}

function pakistanDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(value("year")), date: `${value("year")}-${value("month")}-${value("day")}` };
}

/** Allocate a document-level discount to item rows using exact integer cents. */
function allocateDiscountCents(lineGrossCents: number[], discountCents: number): number[] {
  const subtotalCents = lineGrossCents.reduce((sum, value) => sum + value, 0);
  if (discountCents === 0) return lineGrossCents.map(() => 0);
  if (subtotalCents <= 0 || discountCents > subtotalCents) {
    throw new PosCheckoutError("The discount cannot exceed the sale subtotal.");
  }

  const records = lineGrossCents.map((grossCents, index) => {
    const numerator = new Decimal(discountCents).mul(grossCents);
    const base = Number(numerator.dividedToIntegerBy(subtotalCents).toString());
    return { index, grossCents, base, remainder: numerator.mod(subtotalCents) };
  });
  const allocations = records.map((record) => record.base);
  let remaining = discountCents - allocations.reduce((sum, value) => sum + value, 0);
  const order = [...records].sort((a, b) => {
    const compare = b.remainder.comparedTo(a.remainder);
    return compare !== 0 ? compare : a.index - b.index;
  });

  for (const record of order) {
    if (remaining <= 0) break;
    if (allocations[record.index] < record.grossCents) {
      allocations[record.index] += 1;
      remaining -= 1;
    }
  }

  if (remaining !== 0) throw new PosCheckoutError("The sale discount could not be allocated exactly.");
  return allocations;
}

export async function getPosScreenDataForShop(shopId: string) {
  const catalog = await db
    .select({
      variantId: productVariants.id,
      productName: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      sellingPrice: productVariants.sellingPrice,
      trackByImei: productVariants.trackByImei,
      stockQuantity: sql<number>`COALESCE(${inventoryBalances.quantity}, 0)::int`,
    })
    .from(productVariants)
    .innerJoin(products, and(eq(products.id, productVariants.productId), eq(products.shopId, productVariants.shopId)))
    .leftJoin(inventoryBalances, and(eq(inventoryBalances.shopId, productVariants.shopId), eq(inventoryBalances.variantId, productVariants.id)))
    .where(and(eq(productVariants.shopId, shopId), eq(productVariants.active, true), eq(products.active, true)))
    .orderBy(asc(products.name), asc(productVariants.name));

  const imeiVariantIds = catalog.filter((row) => row.trackByImei).map((row) => row.variantId);
  const devices = imeiVariantIds.length > 0
    ? await db
        .select({
          id: imeiDevices.id,
          variantId: imeiDevices.variantId,
          imei1: imeiDevices.imei1,
          imei2: imeiDevices.imei2,
          serialNumber: imeiDevices.serialNumber,
        })
        .from(imeiDevices)
        .where(and(eq(imeiDevices.shopId, shopId), eq(imeiDevices.status, "IN_STOCK"), inArray(imeiDevices.variantId, imeiVariantIds)))
        .orderBy(asc(imeiDevices.imei1))
    : [];

  const paymentCandidates = await db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      kind: financialAccounts.kind,
      ledgerAccountId: ledgerAccounts.id,
      ledgerCode: ledgerAccounts.code,
    })
    .from(financialAccounts)
    .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.id, financialAccounts.ledgerAccountId), eq(ledgerAccounts.shopId, financialAccounts.shopId)))
    .where(and(eq(financialAccounts.shopId, shopId), eq(financialAccounts.isActive, true), eq(ledgerAccounts.active, true), eq(ledgerAccounts.accountType, "ASSET"), eq(ledgerAccounts.normalBalance, "DEBIT")))
    .orderBy(asc(financialAccounts.name));

  const possibleParentIds = paymentCandidates.map((account) => account.ledgerAccountId);
  const childRows = possibleParentIds.length > 0
    ? await db.select({ parentId: ledgerAccounts.parentId }).from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, shopId), inArray(ledgerAccounts.parentId, possibleParentIds)))
    : [];
  const parentIds = new Set(childRows.map((row) => row.parentId).filter((value): value is string => value !== null));
  const paymentAccounts = paymentCandidates
    .filter((account) => !parentIds.has(account.ledgerAccountId))
    .map(({ id, name, kind }) => ({ id, name, kind }));

  const customerOptions = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.shopId, shopId), eq(customers.active, true)))
    .orderBy(asc(customers.name));

  const defaultRetailCashDrawerId = await getDefaultCashDrawerForShop(shopId, "RETAIL");
  return { catalog, devices, paymentAccounts, customers: customerOptions, defaultRetailCashDrawerId };
}

export async function completeSaleForShop(input: {
  shopId: string;
  createdBy: string;
  cartJson: string;
  discountAmount: string;
  paymentAllocationsJson: string;
  customerId: string | null;
  allowCreditBalance: boolean;
}) {
  const cart = parseCart(input.cartJson);
  const discount = parseMoney(input.discountAmount.trim() || "0", "Discount");
  const paymentAllocations = parsePaymentAllocations(input.paymentAllocationsJson);
  const customerId = input.customerId?.trim() || null;
  if (customerId && !UUID_PATTERN.test(customerId)) {
    throw new PosCheckoutError("Select a valid customer or choose walk-in customer.");
  }

  const nonImeiVariants = new Set<string>();
  const selectedDeviceIds = new Set<string>();
  for (const line of cart) {
    if (line.imeiDeviceId) {
      if (line.quantity !== 1) throw new PosCheckoutError("Each IMEI-tracked phone must be a separate cart line with quantity 1.");
      if (selectedDeviceIds.has(line.imeiDeviceId)) throw new PosCheckoutError("The same IMEI device cannot be sold twice in one sale.");
      selectedDeviceIds.add(line.imeiDeviceId);
    } else {
      if (nonImeiVariants.has(line.variantId)) throw new PosCheckoutError("A quantity-tracked variant must appear in only one cart line. Refresh the cart and try again.");
      nonImeiVariants.add(line.variantId);
    }
  }

  return db.transaction(async (tx) => {
    const variantIds = [...new Set(cart.map((line) => line.variantId))].sort();
    const variants = await tx
      .select({
        id: productVariants.id,
        productId: products.id,
        productName: products.name,
        variantName: productVariants.name,
        sku: productVariants.sku,
        sellingPrice: productVariants.sellingPrice,
        trackByImei: productVariants.trackByImei,
        productActive: products.active,
        variantActive: productVariants.active,
      })
      .from(productVariants)
      .innerJoin(products, and(eq(products.id, productVariants.productId), eq(products.shopId, productVariants.shopId)))
      .where(and(eq(productVariants.shopId, input.shopId), inArray(productVariants.id, variantIds)))
      .orderBy(asc(productVariants.id))
      .for("update");

    if (variants.length !== variantIds.length || variants.some((variant) => !variant.productActive || !variant.variantActive)) {
      throw new PosCheckoutError("One or more products are no longer available. Refresh the POS and try again.");
    }

    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    for (const line of cart) {
      const variant = variantById.get(line.variantId);
      if (!variant) throw new PosCheckoutError("A selected product variant could not be found.");
      if (variant.trackByImei && !line.imeiDeviceId) throw new PosCheckoutError(`${variant.productName} (${variant.variantName}) requires a specific IMEI device to be selected.`);
      if (!variant.trackByImei && line.imeiDeviceId) throw new PosCheckoutError(`${variant.productName} (${variant.variantName}) does not use IMEI tracking.`);
    }

    const balanceRows = await tx
      .select({ id: inventoryBalances.id, variantId: inventoryBalances.variantId, quantity: inventoryBalances.quantity, averageCost: inventoryBalances.averageCost })
      .from(inventoryBalances)
      .where(and(eq(inventoryBalances.shopId, input.shopId), inArray(inventoryBalances.variantId, variantIds)))
      .orderBy(asc(inventoryBalances.variantId))
      .for("update");
    const balanceByVariant = new Map(balanceRows.map((row) => [row.variantId, row]));

    const qtyByVariant = new Map<string, number>();
    for (const line of cart) qtyByVariant.set(line.variantId, (qtyByVariant.get(line.variantId) ?? 0) + line.quantity);
    for (const [variantId, quantity] of qtyByVariant) {
      const variant = variantById.get(variantId)!;
      const balance = balanceByVariant.get(variantId);
      if (!balance) throw new PosCheckoutError(`${variant.productName} (${variant.variantName}) has no inventory balance record. Receive stock through a posted purchase before selling it.`);
      if (balance.quantity < quantity) throw new PosCheckoutError(`Insufficient stock for ${variant.productName} (${variant.variantName}). Available: ${balance.quantity}; requested: ${quantity}.`);
    }

    const selectedDevices = selectedDeviceIds.size > 0
      ? await tx
          .select({ id: imeiDevices.id, variantId: imeiDevices.variantId, imei1: imeiDevices.imei1, purchaseCost: imeiDevices.purchaseCost })
          .from(imeiDevices)
          .where(and(eq(imeiDevices.shopId, input.shopId), eq(imeiDevices.status, "IN_STOCK"), inArray(imeiDevices.id, [...selectedDeviceIds])))
          .orderBy(asc(imeiDevices.id))
          .for("update")
      : [];
    if (selectedDevices.length !== selectedDeviceIds.size) {
      throw new PosCheckoutError("One or more selected phones are no longer in stock. Refresh the POS and select the available device again.");
    }
    const deviceById = new Map(selectedDevices.map((device) => [device.id, device]));
    for (const line of cart) {
      if (!line.imeiDeviceId) continue;
      const device = deviceById.get(line.imeiDeviceId);
      if (!device || device.variantId !== line.variantId) {
        throw new PosCheckoutError("A selected IMEI device does not belong to its chosen product variant.");
      }
    }

    const preparedLines: PreparedSaleLine[] = cart.map((line) => {
      const variant = variantById.get(line.variantId)!;
      const device = line.imeiDeviceId ? deviceById.get(line.imeiDeviceId) : undefined;
      const unitPrice = new Decimal(variant.sellingPrice);
      const unitCost = device ? new Decimal(device.purchaseCost) : new Decimal(balanceByVariant.get(line.variantId)!.averageCost);
      const grossCents = cents(unitPrice.mul(line.quantity));
      return {
        ...line,
        description: `${variant.productName} — ${variant.variantName}`,
        sku: variant.sku,
        trackByImei: variant.trackByImei,
        unitPrice,
        unitCost,
        grossCents,
        discountCents: 0,
        lineTotalCents: grossCents,
      };
    });

    const subtotalCents = preparedLines.reduce((sum, line) => sum + line.grossCents, 0);
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents > cents(MAX_MONEY)) {
      throw new PosCheckoutError("The sale subtotal exceeds the supported amount.");
    }
    const discountCents = cents(discount);
    if (discountCents > subtotalCents) throw new PosCheckoutError("The discount cannot exceed the sale subtotal.");
    const allocations = allocateDiscountCents(preparedLines.map((line) => line.grossCents), discountCents);
    preparedLines.forEach((line, index) => {
      line.discountCents = allocations[index];
      line.lineTotalCents = line.grossCents - allocations[index];
    });

    const totalCents = subtotalCents - discountCents;
    if (totalCents <= 0) throw new PosCheckoutError("The final sale total must be greater than Rs 0.00.");
    const cogsCents = preparedLines.reduce((sum, line) => sum + cents(line.unitCost.mul(line.quantity)), 0);
    if (!Number.isSafeInteger(cogsCents) || cogsCents < 0 || cogsCents > cents(MAX_MONEY)) {
      throw new PosCheckoutError("The calculated cost of goods sold exceeds the supported amount.");
    }

    const paymentTotalCents = paymentAllocations.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (!Number.isSafeInteger(paymentTotalCents) || paymentTotalCents > totalCents) {
      throw new PosCheckoutError(`Payments cannot exceed the sale total of Rs ${moneyFromCents(totalCents)}.`);
    }
    const outstandingCents = totalCents - paymentTotalCents;
    if (outstandingCents > 0 && !input.allowCreditBalance) {
      throw new PosCheckoutError(`Payment amounts must equal the sale total of Rs ${moneyFromCents(totalCents)} unless customer credit is enabled.`);
    }
    if (outstandingCents > 0 && !customerId) {
      throw new PosCheckoutError("Select a customer before leaving an outstanding credit balance.");
    }
    let customerName: string | null = null;
    if (customerId) {
      const [selectedCustomer] = await tx
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(and(eq(customers.shopId, input.shopId), eq(customers.id, customerId), eq(customers.active, true)))
        .for("update");
      if (!selectedCustomer) throw new PosCheckoutError("The selected customer is inactive or does not belong to this shop.");
      customerName = selectedCustomer.name;
    }

    const paymentAccountIds = paymentAllocations.map((payment) => payment.financialAccountId).sort();
    const paymentAccounts = await tx
      .select({ id: financialAccounts.id, name: financialAccounts.name, ledgerAccountId: ledgerAccounts.id, accountType: ledgerAccounts.accountType, normalBalance: ledgerAccounts.normalBalance, ledgerActive: ledgerAccounts.active, isActive: financialAccounts.isActive })
      .from(financialAccounts)
      .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.id, financialAccounts.ledgerAccountId), eq(ledgerAccounts.shopId, financialAccounts.shopId)))
      .where(and(eq(financialAccounts.shopId, input.shopId), inArray(financialAccounts.id, paymentAccountIds)))
      .orderBy(asc(financialAccounts.id))
      .for("update");

    if (paymentAccounts.length !== paymentAccountIds.length) {
      throw new PosCheckoutError("One or more selected payment accounts do not exist in this shop.");
    }
    if (paymentAccounts.some((account) => !account.isActive || !account.ledgerActive || account.accountType !== "ASSET" || account.normalBalance !== "DEBIT")) {
      throw new PosCheckoutError("One or more selected payment accounts are inactive or are not valid asset accounts.");
    }
    const paymentAccountById = new Map(paymentAccounts.map((account) => [account.id, account]));

    const requiredCodes = [
      "4000",
      ...(cogsCents > 0 ? ["1200", "5000"] : []),
      ...(outstandingCents > 0 ? ["1300"] : []),
    ];
    const systemLedgerRows = await tx
      .select()
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, input.shopId), inArray(ledgerAccounts.code, requiredCodes), eq(ledgerAccounts.active, true)))
      .for("update");
    const inventoryLedger = systemLedgerRows.find((row) => row.code === "1200" && row.accountType === "ASSET" && row.normalBalance === "DEBIT");
    const salesLedger = systemLedgerRows.find((row) => row.code === "4000" && row.accountType === "REVENUE" && row.normalBalance === "CREDIT");
    const cogsLedger = systemLedgerRows.find((row) => row.code === "5000" && row.accountType === "EXPENSE" && row.normalBalance === "DEBIT");
    const receivableLedger = systemLedgerRows.find((row) => row.code === "1300" && row.accountType === "ASSET" && row.normalBalance === "DEBIT");
    if (!salesLedger || (cogsCents > 0 && (!inventoryLedger || !cogsLedger)) || (outstandingCents > 0 && !receivableLedger)) {
      throw new PosCheckoutError("The Product Sales, Inventory, COGS, or Accounts Receivable ledger accounts are missing, inactive, or incorrectly configured.");
    }

    const postingAccountIds = [
      ...paymentAccounts.map((account) => account.ledgerAccountId),
      salesLedger.id,
      ...(cogsCents > 0 && inventoryLedger && cogsLedger ? [inventoryLedger.id, cogsLedger.id] : []),
      ...(outstandingCents > 0 && receivableLedger ? [receivableLedger.id] : []),
    ];
    const childAccounts = await tx
      .select({ id: ledgerAccounts.id })
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, input.shopId), inArray(ledgerAccounts.parentId, postingAccountIds)))
      .limit(1);
    if (childAccounts.length > 0) throw new PosCheckoutError("A sale journal cannot post directly to a parent ledger account. Choose a leaf payment account and verify the system chart of accounts.");

    const { year, date } = pakistanDateParts();
    const [{ lastValue }] = await tx
      .insert(documentSequences)
      .values({ shopId: input.shopId, documentType: "SALE", year, lastValue: 1 })
      .onConflictDoUpdate({
        target: [documentSequences.shopId, documentSequences.documentType, documentSequences.year],
        set: { lastValue: sql`${documentSequences.lastValue} + 1` },
      })
      .returning({ lastValue: documentSequences.lastValue });
    const documentNo = `SAL-${year}-${String(lastValue).padStart(6, "0")}`;

    const [sale] = await tx
      .insert(sales)
      .values({
        shopId: input.shopId,
        documentNo,
        customerId,
        status: "COMPLETED",
        subtotal: moneyFromCents(subtotalCents),
        discountAmount: moneyFromCents(discountCents),
        totalAmount: moneyFromCents(totalCents),
        createdBy: input.createdBy,
        completedAt: new Date(),
      })
      .returning({ id: sales.id, documentNo: sales.documentNo });

    const saleItemRecords: Array<{ id: string; line: PreparedSaleLine }> = [];
    for (const line of preparedLines) {
      const [item] = await tx
        .insert(saleItems)
        .values({
          shopId: input.shopId,
          saleId: sale.id,
          variantId: line.variantId,
          imeiDeviceId: line.imeiDeviceId,
          descriptionSnapshot: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice.toFixed(2),
          discountAmount: moneyFromCents(line.discountCents),
          lineTotal: moneyFromCents(line.lineTotalCents),
          costSnapshot: line.unitCost.toFixed(2),
        })
        .returning({ id: saleItems.id });
      saleItemRecords.push({ id: item.id, line });
    }

    // Reduce inventory, mark individual devices SOLD, and record immutable movements.
    for (const [variantId, quantity] of qtyByVariant) {
      const [updated] = await tx
        .update(inventoryBalances)
        .set({ quantity: sql`${inventoryBalances.quantity} - ${quantity}`, updatedAt: new Date() })
        .where(and(eq(inventoryBalances.shopId, input.shopId), eq(inventoryBalances.variantId, variantId), sql`${inventoryBalances.quantity} >= ${quantity}`))
        .returning({ variantId: inventoryBalances.variantId });
      if (!updated) throw new PosCheckoutError("Stock changed while completing the sale. Refresh the POS; no sale was committed.");
    }

    for (const { id: saleItemId, line } of saleItemRecords) {
      await tx.insert(inventoryMovements).values({
        shopId: input.shopId,
        variantId: line.variantId,
        imeiDeviceId: line.imeiDeviceId,
        quantityDelta: -line.quantity,
        movementType: "SALE",
        unitCost: line.unitCost.toFixed(2),
        referenceType: "SALE_ITEM",
        referenceId: saleItemId,
        note: `Sold under ${sale.documentNo}`,
        createdBy: input.createdBy,
      });
    }

    if (selectedDeviceIds.size > 0) {
      const updatedDevices = await tx
        .update(imeiDevices)
        .set({ status: "SOLD", updatedAt: new Date() })
        .where(and(eq(imeiDevices.shopId, input.shopId), eq(imeiDevices.status, "IN_STOCK"), inArray(imeiDevices.id, [...selectedDeviceIds])))
        .returning({ id: imeiDevices.id });
      if (updatedDevices.length !== selectedDeviceIds.size) throw new PosCheckoutError("A selected device was sold by another checkout. No sale was committed; refresh and try again.");
    }

    if (paymentAllocations.length > 0) {
      await tx.insert(salePayments).values(paymentAllocations.map((payment) => ({
        shopId: input.shopId,
        saleId: sale.id,
        financialAccountId: payment.financialAccountId,
        amount: moneyFromCents(payment.amountCents),
        createdBy: input.createdBy,
      })));
    }

    const journalLines: Array<{ ledgerAccountId: string; debit: string; credit: string; description: string }> = [
      ...paymentAllocations.map((payment, index) => {
        const account = paymentAccountById.get(payment.financialAccountId)!;
        return {
          ledgerAccountId: account.ledgerAccountId,
          debit: moneyFromCents(payment.amountCents),
          credit: "0.00",
          description: `Payment ${index + 1} received into ${account.name} - ${sale.documentNo}`,
        };
      }),
      ...(outstandingCents > 0 && receivableLedger ? [{
        ledgerAccountId: receivableLedger.id,
        debit: moneyFromCents(outstandingCents),
        credit: "0.00",
        description: `Customer receivable - ${customerName ?? "customer"} - ${sale.documentNo}`,
      }] : []),
      { ledgerAccountId: salesLedger.id, debit: "0.00", credit: moneyFromCents(totalCents), description: `Product sale - ${sale.documentNo}` },
    ];
    if (cogsCents > 0 && inventoryLedger && cogsLedger) {
      journalLines.push(
        { ledgerAccountId: cogsLedger.id, debit: moneyFromCents(cogsCents), credit: "0.00", description: `Cost of goods sold - ${sale.documentNo}` },
        { ledgerAccountId: inventoryLedger.id, debit: "0.00", credit: moneyFromCents(cogsCents), description: `Inventory relieved - ${sale.documentNo}` },
      );
    }

    const debitTotal = journalLines.reduce((sum, line) => sum.plus(line.debit), new Decimal(0));
    const creditTotal = journalLines.reduce((sum, line) => sum.plus(line.credit), new Decimal(0));
    if (!debitTotal.equals(creditTotal)) throw new PosCheckoutError("The sale journal is not balanced. Nothing was posted.");

    const [journal] = await tx
      .insert(ledgerTransactions)
      .values({
        shopId: input.shopId,
        referenceType: "SALE",
        referenceId: sale.id,
        description: `Sale completed: ${sale.documentNo}`,
        createdBy: input.createdBy,
      })
      .returning({ id: ledgerTransactions.id });
    await tx.insert(ledgerEntries).values(journalLines.map((line) => ({ shopId: input.shopId, ledgerTransactionId: journal.id, ...line })));

    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.createdBy,
      action: "SALE_COMPLETED",
      entityType: "SALE",
      entityId: sale.id,
      metadata: {
        documentNo: sale.documentNo,
        subtotal: moneyFromCents(subtotalCents),
        discountAmount: moneyFromCents(discountCents),
        totalAmount: moneyFromCents(totalCents),
        customerId,
        customerName,
        amountReceived: moneyFromCents(paymentTotalCents),
        outstandingAmount: moneyFromCents(outstandingCents),
        costOfGoodsSold: moneyFromCents(cogsCents),
        payments: paymentAllocations.map((payment) => ({
          financialAccountId: payment.financialAccountId,
          financialAccountName: paymentAccountById.get(payment.financialAccountId)?.name ?? "Unknown account",
          amount: moneyFromCents(payment.amountCents),
        })),
        itemCount: preparedLines.length,
        totalUnits: preparedLines.reduce((sum, line) => sum + line.quantity, 0),
      },
    });

    return {
      id: sale.id,
      documentNo: sale.documentNo,
      subtotal: moneyFromCents(subtotalCents),
      discountAmount: moneyFromCents(discountCents),
      totalAmount: moneyFromCents(totalCents),
      amountReceived: moneyFromCents(paymentTotalCents),
      outstandingAmount: moneyFromCents(outstandingCents),
      customerId,
      customerName,
      costOfGoodsSold: moneyFromCents(cogsCents),
      totalUnits: preparedLines.reduce((sum, line) => sum + line.quantity, 0),
      pakistanDate: date,
    };
  });
}

export async function listRecentSalesForShop(shopId: string) {
  return db
    .select({
      id: sales.id,
      documentNo: sales.documentNo,
      status: sales.status,
      subtotal: sales.subtotal,
      discountAmount: sales.discountAmount,
      totalAmount: sales.totalAmount,
      createdAt: sales.createdAt,
      customerName: customers.name,
      totalReceived: sql<string>`COALESCE((SELECT SUM(sp.amount::numeric) FROM sale_payments sp WHERE sp.shop_id = "sales"."shop_id" AND sp.sale_id = "sales"."id"), 0)::text`,
      totalReturned: sql<string>`COALESCE((SELECT SUM(sri.amount::numeric) FROM sale_return_items sri INNER JOIN sale_returns sr ON sr.shop_id = sri.shop_id AND sr.id = sri.return_id WHERE sri.shop_id = "sales"."shop_id" AND sr.original_sale_id = "sales"."id" AND sr.status = 'COMPLETED'), 0)::text`,
      exchangeCreditApplied: sql<string>`COALESCE((SELECT SUM(sri.amount::numeric) FROM sale_returns exchange_return INNER JOIN sale_return_items sri ON sri.shop_id = exchange_return.shop_id AND sri.return_id = exchange_return.id WHERE exchange_return.shop_id = "sales"."shop_id" AND exchange_return.replacement_sale_id = "sales"."id" AND exchange_return.status = 'COMPLETED'), 0)::text`,
    })
    .from(sales)
    .leftJoin(customers, and(eq(customers.shopId, sales.shopId), eq(customers.id, sales.customerId)))
    .where(eq(sales.shopId, shopId))
    .orderBy(desc(sales.createdAt))
    .limit(100);
}

export async function getSaleDetailsForShop(shopId: string, saleId: string) {
  if (!UUID_PATTERN.test(saleId)) return null;
  const [sale] = await db
    .select({
      id: sales.id,
      documentNo: sales.documentNo,
      status: sales.status,
      subtotal: sales.subtotal,
      discountAmount: sales.discountAmount,
      totalAmount: sales.totalAmount,
      createdAt: sales.createdAt,
      completedAt: sales.completedAt,
      customerId: sales.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      exchangeCreditApplied: sql<string>`COALESCE((SELECT SUM(sri.amount::numeric) FROM sale_returns exchange_return INNER JOIN sale_return_items sri ON sri.shop_id = exchange_return.shop_id AND sri.return_id = exchange_return.id WHERE exchange_return.shop_id = "sales"."shop_id" AND exchange_return.replacement_sale_id = "sales"."id" AND exchange_return.status = 'COMPLETED'), 0)::text`,
    })
    .from(sales)
    .leftJoin(customers, and(eq(customers.shopId, sales.shopId), eq(customers.id, sales.customerId)))
    .where(and(eq(sales.shopId, shopId), eq(sales.id, saleId)))
    .limit(1);
  if (!sale) return null;

  const items = await db
    .select({
      id: saleItems.id,
      description: saleItems.descriptionSnapshot,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      discountAmount: saleItems.discountAmount,
      lineTotal: saleItems.lineTotal,
      costSnapshot: saleItems.costSnapshot,
      imei1: imeiDevices.imei1,
      imei2: imeiDevices.imei2,
      serialNumber: imeiDevices.serialNumber,
    })
    .from(saleItems)
    .leftJoin(imeiDevices, and(eq(imeiDevices.shopId, saleItems.shopId), eq(imeiDevices.id, saleItems.imeiDeviceId)))
    .where(and(eq(saleItems.shopId, shopId), eq(saleItems.saleId, saleId)))
    .orderBy(asc(saleItems.descriptionSnapshot));

  const payments = await db
    .select({
      amount: salePayments.amount,
      paidAt: salePayments.paidAt,
      accountName: financialAccounts.name,
    })
    .from(salePayments)
    .innerJoin(financialAccounts, and(eq(financialAccounts.shopId, salePayments.shopId), eq(financialAccounts.id, salePayments.financialAccountId)))
    .where(and(eq(salePayments.shopId, shopId), eq(salePayments.saleId, saleId)))
    .orderBy(asc(salePayments.paidAt));

  const paymentCandidates = await db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      kind: financialAccounts.kind,
      ledgerAccountId: ledgerAccounts.id,
    })
    .from(financialAccounts)
    .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.id, financialAccounts.ledgerAccountId), eq(ledgerAccounts.shopId, financialAccounts.shopId)))
    .where(and(eq(financialAccounts.shopId, shopId), eq(financialAccounts.isActive, true), eq(ledgerAccounts.active, true), eq(ledgerAccounts.accountType, "ASSET"), eq(ledgerAccounts.normalBalance, "DEBIT")))
    .orderBy(asc(financialAccounts.name));
  const possibleParentIds = paymentCandidates.map((account) => account.ledgerAccountId);
  const childRows = possibleParentIds.length > 0
    ? await db.select({ parentId: ledgerAccounts.parentId }).from(ledgerAccounts).where(and(eq(ledgerAccounts.shopId, shopId), inArray(ledgerAccounts.parentId, possibleParentIds)))
    : [];
  const parentIds = new Set(childRows.map((row) => row.parentId).filter((value): value is string => value !== null));
  const paymentAccounts = paymentCandidates
    .filter((account) => !parentIds.has(account.ledgerAccountId))
    .map(({ id, name, kind }) => ({ id, name, kind }));

  return { sale, items, payments, paymentAccounts };
}
