import "server-only";

import Decimal from "decimal.js";
import {
    and,
    asc,
    desc,
    eq,
    inArray,
    or,
    sql,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
    auditLogs,
    documentSequences,
    productVariants,
    products,
    purchaseItems,
    purchasePayments,
    purchases,
    suppliers,
} from "@/db/schema";

export type PurchaseDraftLineInput = {
    variantId: string;
    quantity: string;
    unitCost: string;
};

export type PurchaseDraftInput = {
    supplierId: string;
    purchaseDate: string;
    discountAmount: string;
    notes: string;
    lines: PurchaseDraftLineInput[];
};

export class PurchaseDraftError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PurchaseDraftError";
    }
}

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;
const MAX_MONEY = new Decimal("999999999999.99");
const MAX_QUANTITY = 1_000_000;

type PreparedPurchaseLine = {
    variantId: string;
    quantity: number;
    unitCost: Decimal;
    lineTotal: Decimal;
};

type PreparedPurchase = {
    supplierId: string;
    purchaseDate: string;
    year: number;
    discountAmount: Decimal;
    notes: string | null;
    lines: PreparedPurchaseLine[];
    subtotal: Decimal;
    totalAmount: Decimal;
};

function parseMoney(value: string, fieldName: string): Decimal {
    const normalized = value.trim();

    if (!MONEY_PATTERN.test(normalized)) {
        throw new PurchaseDraftError(
            `${fieldName} must be a valid amount with no more than two decimal places.`,
        );
    }

    const amount = new Decimal(normalized);

    if (!amount.isFinite() || amount.isNegative()) {
        throw new PurchaseDraftError(`${fieldName} cannot be negative.`);
    }

    if (amount.greaterThan(MAX_MONEY)) {
        throw new PurchaseDraftError(`${fieldName} exceeds the allowed amount.`);
    }

    return amount;
}

function validatePurchaseDate(value: string): { date: string; year: number } {
    const date = value.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new PurchaseDraftError("Enter a valid purchase date.");
    }

    const parsed = new Date(`${date}T00:00:00.000Z`);

    if (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
    ) {
        throw new PurchaseDraftError("Enter a valid purchase date.");
    }

    const year = Number(date.slice(0, 4));

    if (year < 2000) {
        throw new PurchaseDraftError(
            "Purchase dates before the year 2000 are not supported.",
        );
    }

    return { date, year };
}

function normalizeNotes(value: string): string | null {
    const notes = value.trim();

    if (notes.length > 2000) {
        throw new PurchaseDraftError("Notes must be 2,000 characters or fewer.");
    }

    return notes || null;
}

function preparePurchaseInput(purchase: PurchaseDraftInput): PreparedPurchase {
    const supplierId = purchase.supplierId.trim();

    if (!UUID_PATTERN.test(supplierId)) {
        throw new PurchaseDraftError("Select a valid supplier.");
    }

    const { date: purchaseDate, year } = validatePurchaseDate(
        purchase.purchaseDate,
    );

    if (!Array.isArray(purchase.lines) || purchase.lines.length === 0 || purchase.lines.length > 100) {
        throw new PurchaseDraftError(
            "Add at least one item and no more than 100 lines.",
        );
    }

    const seenVariantIds = new Set<string>();

    const lines = purchase.lines.map((line, index) => {
        const lineNumber = index + 1;
        const variantId = line.variantId.trim();

        if (!UUID_PATTERN.test(variantId)) {
            throw new PurchaseDraftError(
                `Select a valid product variant on line ${lineNumber}.`,
            );
        }

        if (seenVariantIds.has(variantId)) {
            throw new PurchaseDraftError(
                "Each product variant must appear only once. Combine duplicate lines.",
            );
        }

        seenVariantIds.add(variantId);

        if (!/^[1-9]\d*$/.test(line.quantity.trim())) {
            throw new PurchaseDraftError(
                `Quantity on line ${lineNumber} must be a positive whole number.`,
            );
        }

        const quantity = Number(line.quantity);

        if (!Number.isSafeInteger(quantity) || quantity > MAX_QUANTITY) {
            throw new PurchaseDraftError(
                `Quantity on line ${lineNumber} is too large.`,
            );
        }

        const unitCost = parseMoney(line.unitCost, `Unit cost on line ${lineNumber}`);
        const lineTotal = unitCost.mul(quantity);

        if (lineTotal.greaterThan(MAX_MONEY)) {
            throw new PurchaseDraftError(
                `Line ${lineNumber} exceeds the allowed total.`,
            );
        }

        return { variantId, quantity, unitCost, lineTotal };
    });

    const subtotal = lines.reduce(
        (total, line) => total.plus(line.lineTotal),
        new Decimal(0),
    );

    if (subtotal.greaterThan(MAX_MONEY)) {
        throw new PurchaseDraftError(
            "The purchase subtotal exceeds the allowed amount.",
        );
    }

    const discountAmount = parseMoney(
        purchase.discountAmount.trim() || "0",
        "Purchase discount",
    );

    if (discountAmount.greaterThan(subtotal)) {
        throw new PurchaseDraftError(
            "The discount cannot exceed the purchase subtotal.",
        );
    }

    return {
        supplierId,
        purchaseDate,
        year,
        discountAmount,
        notes: normalizeNotes(purchase.notes),
        lines,
        subtotal,
        totalAmount: subtotal.minus(discountAmount),
    };
}

export async function getPurchaseDraftOptions(
    shopId: string,
    include?: { supplierId?: string | null; variantIds?: string[] },
) {
    const includedSupplierId = include?.supplierId;
    const includedVariantIds = [...new Set(include?.variantIds ?? [])].filter(
        (id) => UUID_PATTERN.test(id),
    );

    const supplierCondition = includedSupplierId
        ? or(
              eq(suppliers.active, true),
              eq(suppliers.id, includedSupplierId),
          )
        : eq(suppliers.active, true);

    const variantAvailabilityCondition = includedVariantIds.length > 0
        ? or(
              and(
                  eq(productVariants.active, true),
                  eq(products.active, true),
              ),
              inArray(productVariants.id, includedVariantIds),
          )
        : and(
              eq(productVariants.active, true),
              eq(products.active, true),
          );

    const [supplierOptions, variantOptions] = await Promise.all([
        db
            .select({ id: suppliers.id, name: suppliers.name, active: suppliers.active })
            .from(suppliers)
            .where(and(eq(suppliers.shopId, shopId), supplierCondition))
            .orderBy(asc(suppliers.name)),

        db
            .select({
                id: productVariants.id,
                sku: productVariants.sku,
                variantName: productVariants.name,
                productName: products.name,
                trackByImei: productVariants.trackByImei,
                variantActive: productVariants.active,
                productActive: products.active,
            })
            .from(productVariants)
            .innerJoin(
                products,
                and(
                    eq(products.id, productVariants.productId),
                    eq(products.shopId, productVariants.shopId),
                ),
            )
            .where(
                and(
                    eq(productVariants.shopId, shopId),
                    variantAvailabilityCondition,
                ),
            )
            .orderBy(asc(products.name), asc(productVariants.name)),
    ]);

    return { suppliers: supplierOptions, variants: variantOptions };
}

export async function getPurchaseDraftForEdit(
    shopId: string,
    purchaseId: string,
) {
    if (!UUID_PATTERN.test(purchaseId)) return null;

    const [purchase] = await db
        .select({
            id: purchases.id,
            documentNo: purchases.documentNo,
            supplierId: purchases.supplierId,
            status: purchases.status,
            purchaseDate: purchases.purchaseDate,
            subtotal: purchases.subtotal,
            discountAmount: purchases.discountAmount,
            totalAmount: purchases.totalAmount,
            notes: purchases.notes,
        })
        .from(purchases)
        .where(
            and(
                eq(purchases.shopId, shopId),
                eq(purchases.id, purchaseId),
                eq(purchases.status, "DRAFT"),
            ),
        )
        .limit(1);

    if (!purchase) return null;

    const lines = await db
        .select({
            variantId: purchaseItems.variantId,
            quantity: purchaseItems.quantity,
            unitCost: purchaseItems.unitCost,
        })
        .from(purchaseItems)
        .where(
            and(
                eq(purchaseItems.shopId, shopId),
                eq(purchaseItems.purchaseId, purchaseId),
            ),
        )
        .orderBy(asc(purchaseItems.id));

    return { ...purchase, lines };
}

export async function listRecentPurchases(shopId: string) {
    return db
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
        .where(eq(purchases.shopId, shopId))
        .orderBy(desc(purchases.createdAt))
        .limit(50);
}

export async function createPurchaseDraftForShop(input: {
    shopId: string;
    createdBy: string;
    purchase: PurchaseDraftInput;
}) {
    const { shopId, createdBy, purchase } = input;
    const prepared = preparePurchaseInput(purchase);

    return db.transaction(async (tx) => {
        const [supplier] = await tx
            .select({ id: suppliers.id })
            .from(suppliers)
            .where(
                and(
                    eq(suppliers.id, prepared.supplierId),
                    eq(suppliers.shopId, shopId),
                    eq(suppliers.active, true),
                ),
            )
            .limit(1);

        if (!supplier) {
            throw new PurchaseDraftError(
                "The selected supplier is unavailable. Reactivate it or select another supplier.",
            );
        }

        const eligibleVariants = await tx
            .select({ id: productVariants.id })
            .from(productVariants)
            .innerJoin(
                products,
                and(
                    eq(products.id, productVariants.productId),
                    eq(products.shopId, productVariants.shopId),
                ),
            )
            .where(
                and(
                    eq(productVariants.shopId, shopId),
                    eq(productVariants.active, true),
                    eq(products.active, true),
                    inArray(
                        productVariants.id,
                        prepared.lines.map((line) => line.variantId),
                    ),
                ),
            );

        if (eligibleVariants.length !== prepared.lines.length) {
            throw new PurchaseDraftError(
                "One or more selected product variants are unavailable. Refresh the page and try again.",
            );
        }

        const [sequence] = await tx
            .insert(documentSequences)
            .values({
                shopId,
                documentType: "PURCHASE",
                year: prepared.year,
                lastValue: 1,
            })
            .onConflictDoUpdate({
                target: [
                    documentSequences.shopId,
                    documentSequences.documentType,
                    documentSequences.year,
                ],
                set: { lastValue: sql`${documentSequences.lastValue} + 1` },
            })
            .returning({ lastValue: documentSequences.lastValue });

        const documentNo = `PUR-${prepared.year}-${String(
            sequence.lastValue,
        ).padStart(6, "0")}`;

        const [createdPurchase] = await tx
            .insert(purchases)
            .values({
                shopId,
                documentNo,
                supplierId: supplier.id,
                status: "DRAFT",
                purchaseDate: prepared.purchaseDate,
                subtotal: prepared.subtotal.toFixed(2),
                discountAmount: prepared.discountAmount.toFixed(2),
                totalAmount: prepared.totalAmount.toFixed(2),
                notes: prepared.notes,
                createdBy,
            })
            .returning({ id: purchases.id, documentNo: purchases.documentNo });

        await tx.insert(purchaseItems).values(
            prepared.lines.map((line) => ({
                shopId,
                purchaseId: createdPurchase.id,
                variantId: line.variantId,
                quantity: line.quantity,
                unitCost: line.unitCost.toFixed(2),
                discountAmount: "0.00",
                lineTotal: line.lineTotal.toFixed(2),
            })),
        );

        await tx.insert(auditLogs).values({
            shopId,
            actorUserId: createdBy,
            action: "PURCHASE_DRAFT_CREATED",
            entityType: "PURCHASE",
            entityId: createdPurchase.id,
            metadata: {
                documentNo: createdPurchase.documentNo,
                supplierId: supplier.id,
                purchaseDate: prepared.purchaseDate,
                subtotal: prepared.subtotal.toFixed(2),
                discountAmount: prepared.discountAmount.toFixed(2),
                totalAmount: prepared.totalAmount.toFixed(2),
                lines: prepared.lines.map((line) => ({
                    variantId: line.variantId,
                    quantity: line.quantity,
                    unitCost: line.unitCost.toFixed(2),
                })),
            },
        });

        // A draft has no stock, payment, or ledger side effects.
        return createdPurchase;
    });
}

export async function updatePurchaseDraftForShop(input: {
    shopId: string;
    updatedBy: string;
    purchaseId: string;
    purchase: PurchaseDraftInput;
}) {
    const { shopId, updatedBy, purchaseId } = input;
    if (!UUID_PATTERN.test(purchaseId)) {
        throw new PurchaseDraftError("Select a valid purchase document.");
    }

    const prepared = preparePurchaseInput(input.purchase);

    return db.transaction(async (tx) => {
        const [currentPurchase] = await tx
            .select()
            .from(purchases)
            .where(
                and(
                    eq(purchases.shopId, shopId),
                    eq(purchases.id, purchaseId),
                ),
            )
            .limit(1)
            .for("update");

        if (!currentPurchase) {
            throw new PurchaseDraftError("Purchase document was not found.");
        }

        if (currentPurchase.status !== "DRAFT") {
            throw new PurchaseDraftError(
                "Only a draft purchase can be edited. Posted and cancelled documents are immutable.",
            );
        }

        const [existingPayment] = await tx
            .select({ id: purchasePayments.id })
            .from(purchasePayments)
            .where(
                and(
                    eq(purchasePayments.shopId, shopId),
                    eq(purchasePayments.purchaseId, purchaseId),
                ),
            )
            .limit(1);

        if (existingPayment) {
            throw new PurchaseDraftError(
                "This draft has a recorded payment and cannot be edited safely. Review the document before continuing.",
            );
        }

        const existingItems = await tx
            .select({
                variantId: purchaseItems.variantId,
                quantity: purchaseItems.quantity,
                unitCost: purchaseItems.unitCost,
            })
            .from(purchaseItems)
            .where(
                and(
                    eq(purchaseItems.shopId, shopId),
                    eq(purchaseItems.purchaseId, purchaseId),
                ),
            )
            .orderBy(asc(purchaseItems.id))
            .for("update");

        const existingVariantIds = [
            ...new Set(existingItems.map((item) => item.variantId)),
        ];

        const [supplier] = await tx
            .select({ id: suppliers.id, active: suppliers.active })
            .from(suppliers)
            .where(
                and(
                    eq(suppliers.id, prepared.supplierId),
                    eq(suppliers.shopId, shopId),
                ),
            )
            .limit(1);

        if (
            !supplier ||
            (!supplier.active && supplier.id !== currentPurchase.supplierId)
        ) {
            throw new PurchaseDraftError(
                "Select an active supplier from this shop. The current inactive supplier can only be kept as-is.",
            );
        }

        const variantStatusCondition = existingVariantIds.length > 0
            ? or(
                  and(
                      eq(productVariants.active, true),
                      eq(products.active, true),
                  ),
                  inArray(productVariants.id, existingVariantIds),
              )
            : and(
                  eq(productVariants.active, true),
                  eq(products.active, true),
              );

        const eligibleVariants = await tx
            .select({ id: productVariants.id })
            .from(productVariants)
            .innerJoin(
                products,
                and(
                    eq(products.id, productVariants.productId),
                    eq(products.shopId, productVariants.shopId),
                ),
            )
            .where(
                and(
                    eq(productVariants.shopId, shopId),
                    inArray(
                        productVariants.id,
                        prepared.lines.map((line) => line.variantId),
                    ),
                    variantStatusCondition,
                ),
            );

        if (eligibleVariants.length !== prepared.lines.length) {
            throw new PurchaseDraftError(
                "Every new or changed variant must be active in this shop. Reactivate unavailable variants or remove them from the draft.",
            );
        }

        await tx
            .update(purchases)
            .set({
                supplierId: supplier.id,
                purchaseDate: prepared.purchaseDate,
                subtotal: prepared.subtotal.toFixed(2),
                discountAmount: prepared.discountAmount.toFixed(2),
                totalAmount: prepared.totalAmount.toFixed(2),
                notes: prepared.notes,
            })
            .where(
                and(
                    eq(purchases.shopId, shopId),
                    eq(purchases.id, purchaseId),
                    eq(purchases.status, "DRAFT"),
                ),
            );

        await tx
            .delete(purchaseItems)
            .where(
                and(
                    eq(purchaseItems.shopId, shopId),
                    eq(purchaseItems.purchaseId, purchaseId),
                ),
            );

        await tx.insert(purchaseItems).values(
            prepared.lines.map((line) => ({
                shopId,
                purchaseId,
                variantId: line.variantId,
                quantity: line.quantity,
                unitCost: line.unitCost.toFixed(2),
                discountAmount: "0.00",
                lineTotal: line.lineTotal.toFixed(2),
            })),
        );

        await tx.insert(auditLogs).values({
            shopId,
            actorUserId: updatedBy,
            action: "PURCHASE_DRAFT_UPDATED",
            entityType: "PURCHASE",
            entityId: purchaseId,
            metadata: {
                documentNo: currentPurchase.documentNo,
                before: {
                    supplierId: currentPurchase.supplierId,
                    purchaseDate: currentPurchase.purchaseDate,
                    subtotal: currentPurchase.subtotal,
                    discountAmount: currentPurchase.discountAmount,
                    totalAmount: currentPurchase.totalAmount,
                    lines: existingItems.map((item) => ({
                        variantId: item.variantId,
                        quantity: item.quantity,
                        unitCost: item.unitCost,
                    })),
                },
                after: {
                    supplierId: supplier.id,
                    purchaseDate: prepared.purchaseDate,
                    subtotal: prepared.subtotal.toFixed(2),
                    discountAmount: prepared.discountAmount.toFixed(2),
                    totalAmount: prepared.totalAmount.toFixed(2),
                    lines: prepared.lines.map((line) => ({
                        variantId: line.variantId,
                        quantity: line.quantity,
                        unitCost: line.unitCost.toFixed(2),
                    })),
                },
            },
        });

        return { id: currentPurchase.id, documentNo: currentPurchase.documentNo };
    });
}

export async function cancelPurchaseDraftForShop(input: {
    shopId: string;
    cancelledBy: string;
    purchaseId: string;
}) {
    const { shopId, cancelledBy, purchaseId } = input;
    if (!UUID_PATTERN.test(purchaseId)) {
        throw new PurchaseDraftError("Select a valid purchase document.");
    }

    return db.transaction(async (tx) => {
        const [purchase] = await tx
            .select()
            .from(purchases)
            .where(
                and(
                    eq(purchases.shopId, shopId),
                    eq(purchases.id, purchaseId),
                ),
            )
            .limit(1)
            .for("update");

        if (!purchase) {
            throw new PurchaseDraftError("Purchase document was not found.");
        }

        if (purchase.status !== "DRAFT") {
            throw new PurchaseDraftError(
                "Only a draft purchase can be cancelled. Posted and already-cancelled documents cannot be changed.",
            );
        }

        const [existingPayment] = await tx
            .select({ id: purchasePayments.id })
            .from(purchasePayments)
            .where(
                and(
                    eq(purchasePayments.shopId, shopId),
                    eq(purchasePayments.purchaseId, purchaseId),
                ),
            )
            .limit(1);

        if (existingPayment) {
            throw new PurchaseDraftError(
                "This draft has a recorded payment and cannot be cancelled automatically. Review the payment records first.",
            );
        }

        await tx
            .update(purchases)
            .set({ status: "CANCELLED" })
            .where(
                and(
                    eq(purchases.shopId, shopId),
                    eq(purchases.id, purchaseId),
                    eq(purchases.status, "DRAFT"),
                ),
            );

        await tx.insert(auditLogs).values({
            shopId,
            actorUserId: cancelledBy,
            action: "PURCHASE_DRAFT_CANCELLED",
            entityType: "PURCHASE",
            entityId: purchaseId,
            metadata: {
                documentNo: purchase.documentNo,
                supplierId: purchase.supplierId,
                purchaseDate: purchase.purchaseDate,
                subtotal: purchase.subtotal,
                discountAmount: purchase.discountAmount,
                totalAmount: purchase.totalAmount,
            },
        });

        return { id: purchase.id, documentNo: purchase.documentNo };
    });
}
