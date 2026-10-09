import "server-only";

import Decimal from "decimal.js";
import {
    and,
    asc,
    desc,
    eq,
    inArray,
    sql,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
    documentSequences,
    productVariants,
    products,
    purchaseItems,
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

function parseMoney(value: string, fieldName: string): Decimal {
    const normalized = value.trim();

    if (!MONEY_PATTERN.test(normalized)) {
        throw new PurchaseDraftError(
            `${fieldName} must be a valid amount with no more than two decimal places.`,
        );
    }

    const amount = new Decimal(normalized);

    if (!amount.isFinite() || amount.isNegative()) {
        throw new PurchaseDraftError(
            `${fieldName} cannot be negative.`,
        );
    }

    if (amount.greaterThan(MAX_MONEY)) {
        throw new PurchaseDraftError(
            `${fieldName} exceeds the allowed amount.`,
        );
    }

    return amount;
}

function validatePurchaseDate(value: string): {
    date: string;
    year: number;
} {
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
        throw new PurchaseDraftError(
            "Notes must be 2,000 characters or fewer.",
        );
    }

    return notes || null;
}

export async function getPurchaseDraftOptions(shopId: string) {
    const [supplierOptions, variantOptions] = await Promise.all([
        db
            .select({
                id: suppliers.id,
                name: suppliers.name,
            })
            .from(suppliers)
            .where(
                and(
                    eq(suppliers.shopId, shopId),
                    eq(suppliers.active, true),
                ),
            )
            .orderBy(asc(suppliers.name)),

        db
            .select({
                id: productVariants.id,
                sku: productVariants.sku,
                variantName: productVariants.name,
                productName: products.name,
                trackByImei: productVariants.trackByImei,
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
                    eq(productVariants.active, true),
                    eq(products.active, true),
                ),
            )
            .orderBy(asc(products.name), asc(productVariants.name)),
    ]);

    return {
        suppliers: supplierOptions,
        variants: variantOptions,
    };
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

    if (!UUID_PATTERN.test(purchase.supplierId)) {
        throw new PurchaseDraftError("Select a valid supplier.");
    }

    const { date: purchaseDate, year } = validatePurchaseDate(
        purchase.purchaseDate,
    );

    if (purchase.lines.length === 0 || purchase.lines.length > 100) {
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

        if (
            !Number.isSafeInteger(quantity) ||
            quantity > MAX_QUANTITY
        ) {
            throw new PurchaseDraftError(
                `Quantity on line ${lineNumber} is too large.`,
            );
        }

        const unitCost = parseMoney(
            line.unitCost,
            `Unit cost on line ${lineNumber}`,
        );

        const lineTotal = unitCost.mul(quantity);

        if (lineTotal.greaterThan(MAX_MONEY)) {
            throw new PurchaseDraftError(
                `Line ${lineNumber} exceeds the allowed total.`,
            );
        }

        return {
            variantId,
            quantity,
            unitCost,
            lineTotal,
        };
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

    const totalAmount = subtotal.minus(discountAmount);
    const notes = normalizeNotes(purchase.notes);

    return db.transaction(async (tx) => {
        // Verify the supplier is still active and belongs to this shop.
        const [supplier] = await tx
            .select({ id: suppliers.id })
            .from(suppliers)
            .where(
                and(
                    eq(suppliers.id, purchase.supplierId),
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

        // Re-check product status and tenant ownership at save time.
        const eligibleVariants = await tx
            .select({
                id: productVariants.id,
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
                    eq(productVariants.active, true),
                    eq(products.active, true),
                    inArray(
                        productVariants.id,
                        lines.map((line) => line.variantId),
                    ),
                ),
            );

        if (eligibleVariants.length !== lines.length) {
            throw new PurchaseDraftError(
                "One or more selected product variants are unavailable. Refresh the page and try again.",
            );
        }

        // Atomic, concurrency-safe document sequence.
        const [sequence] = await tx
            .insert(documentSequences)
            .values({
                shopId,
                documentType: "PURCHASE",
                year,
                lastValue: 1,
            })
            .onConflictDoUpdate({
                target: [
                    documentSequences.shopId,
                    documentSequences.documentType,
                    documentSequences.year,
                ],
                set: {
                    lastValue: sql`${documentSequences.lastValue} + 1`,
                },
            })
            .returning({
                lastValue: documentSequences.lastValue,
            });

        const documentNo = `PUR-${year}-${String(
            sequence.lastValue,
        ).padStart(6, "0")}`;

        const [createdPurchase] = await tx
            .insert(purchases)
            .values({
                shopId,
                documentNo,
                supplierId: supplier.id,
                status: "DRAFT",
                purchaseDate,
                subtotal: subtotal.toFixed(2),
                discountAmount: discountAmount.toFixed(2),
                totalAmount: totalAmount.toFixed(2),
                notes,
                createdBy,
            })
            .returning({
                id: purchases.id,
                documentNo: purchases.documentNo,
            });

        await tx.insert(purchaseItems).values(
            lines.map((line) => ({
                shopId,
                purchaseId: createdPurchase.id,
                variantId: line.variantId,
                quantity: line.quantity,
                unitCost: line.unitCost.toFixed(2),
                discountAmount: "0.00",
                lineTotal: line.lineTotal.toFixed(2),
            })),
        );

        // Deliberately no inventory, payment, or ledger writes here.
        return createdPurchase;
    });
}