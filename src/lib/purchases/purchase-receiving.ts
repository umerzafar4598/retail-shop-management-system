import "server-only";

import Decimal from "decimal.js";
import {
    and,
    asc,
    eq,
    inArray,
    or,
    sql,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
    auditLogs,
    financialAccounts,
    imeiDevices,
    inventoryBalances,
    inventoryMovements,
    ledgerAccounts,
    ledgerEntries,
    ledgerTransactions,
    products,
    purchaseItems,
    purchasePayments,
    purchases,
    productVariants,
    suppliers,
} from "@/db/schema";

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_MONEY = new Decimal("999999999999.99");
const MAX_IMEI_DEVICES_PER_PURCHASE = 500;

export class PurchaseReceiveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PurchaseReceiveError";
    }
}

export async function getPurchaseReceivingDetailsForShop(
    shopId: string,
    purchaseId: string,
) {
    if (!UUID_PATTERN.test(purchaseId)) return null;

    const [purchase] = await db
        .select({
            id: purchases.id,
            documentNo: purchases.documentNo,
            status: purchases.status,
            purchaseDate: purchases.purchaseDate,
            subtotal: purchases.subtotal,
            discountAmount: purchases.discountAmount,
            totalAmount: purchases.totalAmount,
            notes: purchases.notes,
            createdAt: purchases.createdAt,
            postedAt: purchases.postedAt,
            supplierName: suppliers.name,
        })
        .from(purchases)
        .leftJoin(
            suppliers,
            and(
                eq(suppliers.id, purchases.supplierId),
                eq(suppliers.shopId, purchases.shopId),
            ),
        )
        .where(
            and(
                eq(purchases.shopId, shopId),
                eq(purchases.id, purchaseId),
            ),
        )
        .limit(1);

    if (!purchase) return null;

    const items = await db
        .select({
            id: purchaseItems.id,
            variantId: purchaseItems.variantId,
            quantity: purchaseItems.quantity,
            unitCost: purchaseItems.unitCost,
            discountAmount: purchaseItems.discountAmount,
            lineTotal: purchaseItems.lineTotal,
            productName: products.name,
            variantName: productVariants.name,
            sku: productVariants.sku,
            trackByImei: productVariants.trackByImei,
        })
        .from(purchaseItems)
        .innerJoin(
            productVariants,
            and(
                eq(productVariants.id, purchaseItems.variantId),
                eq(productVariants.shopId, purchaseItems.shopId),
            ),
        )
        .innerJoin(
            products,
            and(
                eq(products.id, productVariants.productId),
                eq(products.shopId, productVariants.shopId),
            ),
        )
        .where(
            and(
                eq(purchaseItems.shopId, shopId),
                eq(purchaseItems.purchaseId, purchaseId),
            ),
        )
        .orderBy(asc(products.name), asc(productVariants.name));

    const itemIds = items.map((item) => item.id);

    const devices =
        purchase.status === "POSTED" && itemIds.length > 0
            ? await db
                .select({
                    purchaseItemId: imeiDevices.purchaseItemId,
                    imei1: imeiDevices.imei1,
                    imei2: imeiDevices.imei2,
                    serialNumber: imeiDevices.serialNumber,
                    purchaseCost: imeiDevices.purchaseCost,
                })
                .from(imeiDevices)
                .where(
                    and(
                        eq(imeiDevices.shopId, shopId),
                        inArray(imeiDevices.purchaseItemId, itemIds),
                    ),
                )
            : [];

    const payments = await db
        .select({
            id: purchasePayments.id,
            amount: purchasePayments.amount,
            paidAt: purchasePayments.paidAt,
            accountName: financialAccounts.name,
        })
        .from(purchasePayments)
        .innerJoin(
            financialAccounts,
            and(
                eq(financialAccounts.id, purchasePayments.financialAccountId),
                eq(financialAccounts.shopId, purchasePayments.shopId),
            ),
        )
        .where(
            and(
                eq(purchasePayments.shopId, shopId),
                eq(purchasePayments.purchaseId, purchaseId),
            ),
        );

    const paymentAccounts = await db
        .select({
            id: financialAccounts.id,
            name: financialAccounts.name,
            kind: financialAccounts.kind,
        })
        .from(financialAccounts)
        .innerJoin(
            ledgerAccounts,
            and(
                eq(ledgerAccounts.id, financialAccounts.ledgerAccountId),
                eq(ledgerAccounts.shopId, financialAccounts.shopId),
            ),
        )
        .where(
            and(
                eq(financialAccounts.shopId, shopId),
                eq(financialAccounts.isActive, true),
                eq(ledgerAccounts.active, true),
                eq(ledgerAccounts.accountType, "ASSET"),
                eq(ledgerAccounts.normalBalance, "DEBIT"),
            ),
        )
        .orderBy(asc(financialAccounts.name));

    return {
        purchase,
        items,
        devices,
        payments,
        paymentAccounts,
    };
}

type ReceivedDevice = {
    imei1: string;
    imei2: string | null;
    serialNumber: string | null;
};

function parseMoney(value: string, label: string): Decimal {
    const normalized = value.trim();

    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) {
        throw new PurchaseReceiveError(
            `${label} must be a valid amount with up to two decimal places.`,
        );
    }

    const amount = new Decimal(normalized);

    if (
        !amount.isFinite() ||
        amount.isNegative() ||
        amount.greaterThan(MAX_MONEY)
    ) {
        throw new PurchaseReceiveError(
            `${label} is outside the allowed range.`,
        );
    }

    return amount;
}

function moneyToCents(value: string | Decimal): number {
    return new Decimal(value).mul(100).toNumber();
}

function centsToMoney(value: number): string {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new PurchaseReceiveError(
            "A calculated inventory amount is outside the supported range.",
        );
    }

    return new Decimal(value).div(100).toFixed(2);
}

function normalizeImei(value: string): string {
    return value.trim().replace(/[\s-]/g, "");
}

function parseImeiLines(
    raw: string,
    expectedQuantity: number,
    lineLabel: string,
): ReceivedDevice[] {
    const records = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (records.length !== expectedQuantity) {
        throw new PurchaseReceiveError(
            `${lineLabel}: enter exactly ${expectedQuantity} non-empty device line(s), one for each unit received.`,
        );
    }

    return records.map((record, index) => {
        const parts = record.split("|").map((part) => part.trim());

        if (parts.length > 3) {
            throw new PurchaseReceiveError(
                `${lineLabel}, device ${index + 1}: use IMEI 1 | IMEI 2 | serial number.`,
            );
        }

        const imei1 = normalizeImei(parts[0] ?? "");
        const imei2Value = normalizeImei(parts[1] ?? "");
        const serialValue = (parts[2] ?? "").trim();

        if (!/^\d{15}$/.test(imei1)) {
            throw new PurchaseReceiveError(
                `${lineLabel}, device ${index + 1}: IMEI 1 must contain exactly 15 digits.`,
            );
        }

        if (imei2Value && !/^\d{15}$/.test(imei2Value)) {
            throw new PurchaseReceiveError(
                `${lineLabel}, device ${index + 1}: IMEI 2 must be blank or contain exactly 15 digits.`,
            );
        }

        if (imei2Value && imei2Value === imei1) {
            throw new PurchaseReceiveError(
                `${lineLabel}, device ${index + 1}: IMEI 1 and IMEI 2 cannot be the same.`,
            );
        }

        if (serialValue.length > 100) {
            throw new PurchaseReceiveError(
                `${lineLabel}, device ${index + 1}: the serial number is too long.`,
            );
        }

        return {
            imei1,
            imei2: imei2Value || null,
            serialNumber: serialValue || null,
        };
    });
}

/**
 * Distribute the purchase-level discount proportionally in whole cents.
 * Largest remainders receive the extra cents, so allocations sum exactly
 * to the saved discount and no line receives more discount than its value.
 */
function allocateDiscountCents(
    lineValueCents: number[],
    discountCents: number,
): number[] {
    const subtotalCents = lineValueCents.reduce(
        (total, value) => total + value,
        0,
    );

    if (subtotalCents === 0) {
        if (discountCents !== 0) {
            throw new PurchaseReceiveError(
                "A discount cannot be allocated to a zero-value purchase.",
            );
        }

        return lineValueCents.map(() => 0);
    }

    const allocations: number[] = [];
    const remainders: { index: number; fraction: Decimal }[] = [];

    let allocatedCents = 0;

    lineValueCents.forEach((lineCents, index) => {
        const exact = new Decimal(discountCents)
            .mul(lineCents)
            .div(subtotalCents);

        const wholeCents = exact.floor().toNumber();

        allocations[index] = wholeCents;
        allocatedCents += wholeCents;

        remainders.push({
            index,
            fraction: exact.minus(wholeCents),
        });
    });

    let remainingCents = discountCents - allocatedCents;

    remainders.sort((a, b) => {
        if (a.fraction.greaterThan(b.fraction)) return -1;
        if (a.fraction.lessThan(b.fraction)) return 1;
        return a.index - b.index;
    });

    for (const remainder of remainders) {
        if (remainingCents <= 0) break;

        if (allocations[remainder.index] < lineValueCents[remainder.index]) {
            allocations[remainder.index] += 1;
            remainingCents -= 1;
        }
    }

    if (remainingCents !== 0) {
        throw new PurchaseReceiveError(
            "The purchase discount could not be allocated safely.",
        );
    }

    return allocations;
}

function distributeUnitCosts(
    lineTotalCents: number,
    quantity: number,
): number[] {
    const baseCents = Math.floor(lineTotalCents / quantity);
    const extraCentCount = lineTotalCents % quantity;

    return Array.from(
        { length: quantity },
        (_, index) => baseCents + (index < extraCentCount ? 1 : 0),
    );
}

export type PostPurchaseInput = {
    shopId: string;
    postedBy: string;
    purchaseId: string;
    paidAmount: string;
    financialAccountId: string;
    imeiLinesByItem: Record<string, string>;
};

export async function postPurchaseForShop(input: PostPurchaseInput) {
    const {
        shopId,
        postedBy,
        purchaseId,
        financialAccountId,
        imeiLinesByItem,
    } = input;

    if (!UUID_PATTERN.test(purchaseId)) {
        throw new PurchaseReceiveError("Invalid purchase ID.");
    }

    const paidAmount = parseMoney(
        input.paidAmount.trim() || "0",
        "Amount paid now",
    );

    if (
        Object.keys(imeiLinesByItem).some(
            (itemId) => !UUID_PATTERN.test(itemId),
        )
    ) {
        throw new PurchaseReceiveError("Invalid purchase item ID.");
    }

    return db.transaction(async (tx) => {
        // Lock this purchase so two requests cannot receive it at once.
        const [purchase] = await tx
            .select()
            .from(purchases)
            .where(
                and(
                    eq(purchases.id, purchaseId),
                    eq(purchases.shopId, shopId),
                ),
            )
            .for("update")
            .limit(1);

        if (!purchase) {
            throw new PurchaseReceiveError(
                "Purchase not found in this shop.",
            );
        }

        if (purchase.status !== "DRAFT") {
            throw new PurchaseReceiveError(
                "Only draft purchases can be received. This purchase may already have been posted.",
            );
        }

        const items = await tx
            .select({
                id: purchaseItems.id,
                variantId: purchaseItems.variantId,
                quantity: purchaseItems.quantity,
                unitCost: purchaseItems.unitCost,
                discountAmount: purchaseItems.discountAmount,
                lineTotal: purchaseItems.lineTotal,
                variantName: productVariants.name,
                sku: productVariants.sku,
                trackByImei: productVariants.trackByImei,
            })
            .from(purchaseItems)
            .innerJoin(
                productVariants,
                and(
                    eq(productVariants.id, purchaseItems.variantId),
                    eq(productVariants.shopId, purchaseItems.shopId),
                ),
            )
            .innerJoin(
                products,
                and(
                    eq(products.id, productVariants.productId),
                    eq(products.shopId, productVariants.shopId),
                ),
            )
            .where(
                and(
                    eq(purchaseItems.shopId, shopId),
                    eq(purchaseItems.purchaseId, purchaseId),
                ),
            )
            .orderBy(asc(purchaseItems.id))
            .for("update");

        if (items.length === 0) {
            throw new PurchaseReceiveError(
                "This purchase has no items to receive.",
            );
        }

        const itemIds = new Set(items.map((item) => item.id));

        if (
            Object.keys(imeiLinesByItem).some(
                (itemId) => !itemIds.has(itemId),
            )
        ) {
            throw new PurchaseReceiveError(
                "The receiving form contains an item that does not belong to this purchase.",
            );
        }

        const variantIds = items.map((item) => item.variantId);

        if (new Set(variantIds).size !== variantIds.length) {
            throw new PurchaseReceiveError(
                "This purchase has repeated variants. Correct the draft before receiving it.",
            );
        }

        const lineSubtotal = items.reduce(
            (total, item) => total.plus(item.lineTotal),
            new Decimal(0),
        );

        const purchaseSubtotal = new Decimal(purchase.subtotal);
        const purchaseDiscount = new Decimal(purchase.discountAmount);
        const purchaseTotal = new Decimal(purchase.totalAmount);

        if (!lineSubtotal.equals(purchaseSubtotal)) {
            throw new PurchaseReceiveError(
                "The saved purchase subtotal does not match its item lines. Nothing was posted.",
            );
        }

        if (
            purchaseDiscount.greaterThan(purchaseSubtotal) ||
            !purchaseSubtotal.minus(purchaseDiscount).equals(purchaseTotal)
        ) {
            throw new PurchaseReceiveError(
                "The saved purchase totals are inconsistent. Nothing was posted.",
            );
        }

        if (paidAmount.greaterThan(purchaseTotal)) {
            throw new PurchaseReceiveError(
                "The amount paid now cannot exceed the purchase total.",
            );
        }

        const trackedItems = items.filter((item) => item.trackByImei);
        const totalTrackedUnits = trackedItems.reduce(
            (total, item) => total + item.quantity,
            0,
        );

        if (totalTrackedUnits > MAX_IMEI_DEVICES_PER_PURCHASE) {
            throw new PurchaseReceiveError(
                `This purchase contains more than ${MAX_IMEI_DEVICES_PER_PURCHASE} IMEI-tracked devices. Split the receiving into manageable purchases.`,
            );
        }

        const devicesByItem = new Map<string, ReceivedDevice[]>();
        const allImeis: string[] = [];
        const uniqueImeis = new Set<string>();

        for (const item of items) {
            const raw = imeiLinesByItem[item.id] ?? "";

            if (!item.trackByImei) {
                if (raw.trim()) {
                    throw new PurchaseReceiveError(
                        `${item.variantName} is quantity-tracked and must not contain IMEI entries.`,
                    );
                }

                continue;
            }

            const devices = parseImeiLines(
                raw,
                item.quantity,
                `${item.variantName} (${item.sku})`,
            );

            for (const device of devices) {
                for (const imei of [device.imei1, device.imei2]) {
                    if (!imei) continue;

                    if (uniqueImeis.has(imei)) {
                        throw new PurchaseReceiveError(
                            `IMEI ${imei} appears more than once in this receiving form.`,
                        );
                    }

                    uniqueImeis.add(imei);
                    allImeis.push(imei);
                }
            }

            devicesByItem.set(item.id, devices);
        }

        // Duplicate checks include both IMEI columns already stored in this shop.
        if (allImeis.length > 0) {
            const existingDevices = await tx
                .select({
                    imei1: imeiDevices.imei1,
                    imei2: imeiDevices.imei2,
                })
                .from(imeiDevices)
                .where(
                    and(
                        eq(imeiDevices.shopId, shopId),
                        or(
                            inArray(imeiDevices.imei1, allImeis),
                            inArray(imeiDevices.imei2, allImeis),
                        ),
                    ),
                );

            const existingImeis = new Set<string>();

            for (const device of existingDevices) {
                existingImeis.add(device.imei1);

                if (device.imei2) {
                    existingImeis.add(device.imei2);
                }
            }

            const duplicate = allImeis.find((imei) =>
                existingImeis.has(imei),
            );

            if (duplicate) {
                throw new PurchaseReceiveError(
                    `IMEI ${duplicate} already exists in this shop's inventory.`,
                );
            }
        }

        // The balance row must already exist for each catalog variant.
        // Missing rows are treated as an integrity error, not silently created.
        const balances = await tx
            .select()
            .from(inventoryBalances)
            .where(
                and(
                    eq(inventoryBalances.shopId, shopId),
                    inArray(inventoryBalances.variantId, variantIds),
                ),
            )
            .for("update");

        const balanceByVariant = new Map(
            balances.map((balance) => [balance.variantId, balance]),
        );

        if (balanceByVariant.size !== variantIds.length) {
            throw new PurchaseReceiveError(
                "An inventory balance is missing for one or more variants. Repair the catalog balance before receiving this purchase.",
            );
        }

        const lineValueCents = items.map((item) =>
            moneyToCents(item.lineTotal),
        );

        const discountAllocations = allocateDiscountCents(
            lineValueCents,
            moneyToCents(purchase.discountAmount),
        );

        const receivedItems: {
            item: (typeof items)[number];
            netValueCents: number;
            allocatedDiscountCents: number;
        }[] = [];

        // Update every balance and append immutable purchase movements.
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            const balance = balanceByVariant.get(item.variantId);

            if (!balance) {
                throw new PurchaseReceiveError(
                    `Missing inventory balance for ${item.variantName}.`,
                );
            }

            const allocatedDiscountCents = discountAllocations[index];
            const netValueCents =
                lineValueCents[index] - allocatedDiscountCents;

            if (netValueCents < 0) {
                throw new PurchaseReceiveError(
                    "A line's allocated discount exceeds its value.",
                );
            }

            const newQuantity = balance.quantity + item.quantity;

            if (
                !Number.isSafeInteger(newQuantity) ||
                newQuantity > 2_147_483_647
            ) {
                throw new PurchaseReceiveError(
                    `The resulting quantity for ${item.variantName} exceeds the supported stock range.`,
                );
            }

            const previousValue = new Decimal(balance.averageCost)
                .mul(balance.quantity);

            const receivedValue = new Decimal(centsToMoney(netValueCents));
            const newAverageCost = previousValue
                .plus(receivedValue)
                .div(newQuantity)
                .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

            if (newAverageCost.greaterThan(MAX_MONEY)) {
                throw new PurchaseReceiveError(
                    `The resulting average cost for ${item.variantName} is too large.`,
                );
            }

            await tx
                .update(inventoryBalances)
                .set({
                    quantity: newQuantity,
                    averageCost: newAverageCost.toFixed(2),
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(inventoryBalances.shopId, shopId),
                        eq(inventoryBalances.variantId, item.variantId),
                    ),
                );

            if (item.trackByImei) {
                const devices = devicesByItem.get(item.id) ?? [];

                const deviceCosts = distributeUnitCosts(
                    netValueCents,
                    item.quantity,
                );

                const insertedDevices = await tx
                    .insert(imeiDevices)
                    .values(
                        devices.map((device, deviceIndex) => ({
                            shopId,
                            variantId: item.variantId,
                            imei1: device.imei1,
                            imei2: device.imei2,
                            serialNumber: device.serialNumber,
                            purchaseItemId: item.id,
                            purchaseCost: centsToMoney(deviceCosts[deviceIndex]),
                            status: "IN_STOCK" as const,
                        })),
                    )
                    .returning({
                        id: imeiDevices.id,
                        purchaseCost: imeiDevices.purchaseCost,
                    });

                await tx.insert(inventoryMovements).values(
                    insertedDevices.map((device) => ({
                        shopId,
                        variantId: item.variantId,
                        imeiDeviceId: device.id,
                        quantityDelta: 1,
                        movementType: "PURCHASE" as const,
                        unitCost: device.purchaseCost,
                        referenceType: "PURCHASE_ITEM",
                        referenceId: item.id,
                        note: `Received under ${purchase.documentNo}`,
                        createdBy: postedBy,
                    })),
                );
            } else {
                const movementUnitCost = new Decimal(
                    centsToMoney(netValueCents),
                )
                    .div(item.quantity)
                    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
                    .toFixed(2);

                await tx.insert(inventoryMovements).values({
                    shopId,
                    variantId: item.variantId,
                    quantityDelta: item.quantity,
                    movementType: "PURCHASE",
                    unitCost: movementUnitCost,
                    referenceType: "PURCHASE_ITEM",
                    referenceId: item.id,
                    note: `Received under ${purchase.documentNo}`,
                    createdBy: postedBy,
                });
            }

            receivedItems.push({
                item,
                netValueCents,
                allocatedDiscountCents,
            });
        }

        let paymentLedgerAccountId: string | null = null;

        if (paidAmount.greaterThan(0)) {
            if (!UUID_PATTERN.test(financialAccountId)) {
                throw new PurchaseReceiveError(
                    "Select the financial account that was actually used for this payment.",
                );
            }

            // Lock the financial account and its corresponding ledger account.
            const [account] = await tx
                .select({
                    id: financialAccounts.id,
                    name: financialAccounts.name,
                    ledgerAccountId: financialAccounts.ledgerAccountId,
                    accountType: ledgerAccounts.accountType,
                    normalBalance: ledgerAccounts.normalBalance,
                    ledgerActive: ledgerAccounts.active,
                })
                .from(financialAccounts)
                .innerJoin(
                    ledgerAccounts,
                    and(
                        eq(ledgerAccounts.id, financialAccounts.ledgerAccountId),
                        eq(ledgerAccounts.shopId, financialAccounts.shopId),
                    ),
                )
                .where(
                    and(
                        eq(financialAccounts.id, financialAccountId),
                        eq(financialAccounts.shopId, shopId),
                        eq(financialAccounts.isActive, true),
                    ),
                )
                .for("update")
                .limit(1);

            if (
                !account ||
                !account.ledgerActive ||
                account.accountType !== "ASSET" ||
                account.normalBalance !== "DEBIT"
            ) {
                throw new PurchaseReceiveError(
                    "The selected financial account is unavailable or cannot hold asset balances.",
                );
            }

            const [balanceResult] = await tx
                .select({
                    balance: sql<string>`COALESCE(SUM(${ledgerEntries.debit} - ${ledgerEntries.credit}), 0)::text`,
                })
                .from(ledgerEntries)
                .where(
                    and(
                        eq(ledgerEntries.shopId, shopId),
                        eq(ledgerEntries.ledgerAccountId, account.ledgerAccountId),
                    ),
                );

            const availableBalance = new Decimal(
                balanceResult?.balance ?? "0",
            );

            if (availableBalance.lessThan(paidAmount)) {
                throw new PurchaseReceiveError(
                    `${account.name} does not have enough recorded balance for the payment. Available: Rs ${availableBalance.toFixed(2)}.`,
                );
            }

            paymentLedgerAccountId = account.ledgerAccountId;

            await tx.insert(purchasePayments).values({
                shopId,
                purchaseId,
                financialAccountId: account.id,
                amount: paidAmount.toFixed(2),
                createdBy: postedBy,
            });
        }

        const payableAmount = purchaseTotal.minus(paidAmount);

        // Build a balanced double-entry journal for the purchase.
        if (purchaseTotal.greaterThan(0)) {
            const requiredCodes = ["1200"];

            if (payableAmount.greaterThan(0)) {
                requiredCodes.push("2000");
            }

            const financeAccounts = await tx
                .select()
                .from(ledgerAccounts)
                .where(
                    and(
                        eq(ledgerAccounts.shopId, shopId),
                        inArray(ledgerAccounts.code, requiredCodes),
                        eq(ledgerAccounts.active, true),
                    ),
                )
                .for("update");

            const inventoryLedger = financeAccounts.find(
                (account) =>
                    account.code === "1200" &&
                    account.accountType === "ASSET" &&
                    account.normalBalance === "DEBIT",
            );

            const payableLedger = payableAmount.greaterThan(0)
                ? financeAccounts.find(
                    (account) =>
                        account.code === "2000" &&
                        account.accountType === "LIABILITY" &&
                        account.normalBalance === "CREDIT",
                )
                : undefined;

            if (
                !inventoryLedger ||
                (payableAmount.greaterThan(0) && !payableLedger)
            ) {
                throw new PurchaseReceiveError(
                    "The Inventory or Accounts Payable ledger account is missing, inactive, or incorrectly configured.",
                );
            }

            const ledgerAccountIds = [
                inventoryLedger.id,
                ...(payableLedger ? [payableLedger.id] : []),
                ...(paymentLedgerAccountId ? [paymentLedgerAccountId] : []),
            ];

            const childAccounts = await tx
                .select({ id: ledgerAccounts.id })
                .from(ledgerAccounts)
                .where(
                    and(
                        eq(ledgerAccounts.shopId, shopId),
                        inArray(ledgerAccounts.parentId, ledgerAccountIds),
                    ),
                )
                .limit(1);

            if (childAccounts.length > 0) {
                throw new PurchaseReceiveError(
                    "A purchase journal cannot post directly to a parent ledger account.",
                );
            }

            const entryValues: {
                ledgerAccountId: string;
                debit: string;
                credit: string;
                description: string;
            }[] = [
                    {
                        ledgerAccountId: inventoryLedger.id,
                        debit: purchaseTotal.toFixed(2),
                        credit: "0.00",
                        description: `Inventory received - ${purchase.documentNo}`,
                    },
                ];

            if (paidAmount.greaterThan(0) && paymentLedgerAccountId) {
                entryValues.push({
                    ledgerAccountId: paymentLedgerAccountId,
                    debit: "0.00",
                    credit: paidAmount.toFixed(2),
                    description: `Payment for ${purchase.documentNo}`,
                });
            }

            if (payableAmount.greaterThan(0) && payableLedger) {
                entryValues.push({
                    ledgerAccountId: payableLedger.id,
                    debit: "0.00",
                    credit: payableAmount.toFixed(2),
                    description: `Supplier payable - ${purchase.documentNo}`,
                });
            }

            const debitTotal = entryValues.reduce(
                (total, line) => total.plus(line.debit),
                new Decimal(0),
            );

            const creditTotal = entryValues.reduce(
                (total, line) => total.plus(line.credit),
                new Decimal(0),
            );

            if (
                !debitTotal.equals(creditTotal) ||
                !debitTotal.equals(purchaseTotal)
            ) {
                throw new PurchaseReceiveError(
                    "The purchase journal is not balanced. Nothing was posted.",
                );
            }

            const [journal] = await tx
                .insert(ledgerTransactions)
                .values({
                    shopId,
                    referenceType: "PURCHASE",
                    referenceId: purchase.id,
                    description: `Purchase received: ${purchase.documentNo}`,
                    createdBy: postedBy,
                })
                .returning({ id: ledgerTransactions.id });

            await tx.insert(ledgerEntries).values(
                entryValues.map((line) => ({
                    shopId,
                    ledgerTransactionId: journal.id,
                    ledgerAccountId: line.ledgerAccountId,
                    debit: line.debit,
                    credit: line.credit,
                    description: line.description,
                })),
            );
        }

        const [postedPurchase] = await tx
            .update(purchases)
            .set({
                status: "POSTED",
                postedBy,
                postedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(purchases.id, purchaseId),
                    eq(purchases.shopId, shopId),
                    eq(purchases.status, "DRAFT"),
                ),
            )
            .returning({
                id: purchases.id,
                documentNo: purchases.documentNo,
            });

        if (!postedPurchase) {
            throw new PurchaseReceiveError(
                "The purchase status changed while it was being posted. No changes were committed.",
            );
        }

        await tx.insert(auditLogs).values({
            shopId,
            actorUserId: postedBy,
            action: "PURCHASE_POSTED",
            entityType: "PURCHASE",
            entityId: purchase.id,
            metadata: {
                documentNo: purchase.documentNo,
                totalAmount: purchaseTotal.toFixed(2),
                paidAmount: paidAmount.toFixed(2),
                payableAmount: payableAmount.toFixed(2),
                itemCount: items.length,
                imeiDeviceCount: totalTrackedUnits,
            },
        });

        return {
            id: postedPurchase.id,
            documentNo: postedPurchase.documentNo,
            totalAmount: purchaseTotal.toFixed(2),
            paidAmount: paidAmount.toFixed(2),
            payableAmount: payableAmount.toFixed(2),
            receivedUnitCount: items.reduce(
                (total, item) => total + item.quantity,
                0,
            ),
        };
    });
}