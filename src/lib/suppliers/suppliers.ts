import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { suppliers } from "@/db/schema";

export type SupplierInput = {
    name: string;
    phone: string;
    address: string;
    notes: string;
};

export class SupplierInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SupplierInputError";
    }
}

function normalizeRequiredName(value: string): string {
    const name = value.trim().replace(/\s+/g, " ");

    if (!name) {
        throw new SupplierInputError("Supplier name is required.");
    }

    if (name.length > 150) {
        throw new SupplierInputError(
            "Supplier name must be 150 characters or fewer.",
        );
    }

    return name;
}

function normalizeOptionalText(
    value: string,
    fieldName: string,
    maxLength: number,
): string | null {
    const normalized = value.trim().replace(/\s+/g, " ");

    if (!normalized) return null;

    if (normalized.length > maxLength) {
        throw new SupplierInputError(
            `${fieldName} must be ${maxLength} characters or fewer.`,
        );
    }

    return normalized;
}

export async function listSuppliers(shopId: string) {
    return db
        .select({
            id: suppliers.id,
            name: suppliers.name,
            phone: suppliers.phone,
            address: suppliers.address,
            notes: suppliers.notes,
            active: suppliers.active,
            createdAt: suppliers.createdAt,
        })
        .from(suppliers)
        .where(eq(suppliers.shopId, shopId))
        .orderBy(asc(suppliers.name));
}

export async function createSupplierForShop(
    shopId: string,
    input: SupplierInput,
) {
    const name = normalizeRequiredName(input.name);
    const phone = normalizeOptionalText(input.phone, "Phone", 50);
    const address = normalizeOptionalText(input.address, "Address", 500);
    const notes = normalizeOptionalText(input.notes, "Notes", 2000);

    const existing = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(
            and(
                eq(suppliers.shopId, shopId),
                sql`lower(trim(${suppliers.name})) = lower(${name})`,
            ),
        )
        .limit(1);

    if (existing.length > 0) {
        throw new SupplierInputError(
            "A supplier with this name already exists. Check the existing list before creating another record.",
        );
    }

    const [supplier] = await db
        .insert(suppliers)
        .values({
            shopId,
            name,
            phone,
            address,
            notes,
        })
        .returning({
            id: suppliers.id,
            name: suppliers.name,
        });

    return supplier;
}

export async function setSupplierActiveForShop(
    shopId: string,
    supplierId: string,
    active: boolean,
) {
    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            supplierId,
        )
    ) {
        throw new SupplierInputError("Invalid supplier ID.");
    }

    const [updated] = await db
        .update(suppliers)
        .set({
            active,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(suppliers.id, supplierId),
                eq(suppliers.shopId, shopId),
            ),
        )
        .returning({
            id: suppliers.id,
            name: suppliers.name,
            active: suppliers.active,
        });

    if (!updated) {
        throw new SupplierInputError("Supplier was not found in this shop.");
    }

    return updated;
}