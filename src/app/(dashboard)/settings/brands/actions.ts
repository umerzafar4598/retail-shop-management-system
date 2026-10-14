"use server";

import { logUnexpectedActionError } from "@/lib/errors/safe-action-errors";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/authorization";
import { isPostgresConstraintViolation } from "@/lib/errors/postgres-constraint";
import { getCurrentSession } from "@/lib/session";

function requireUuid(value: string, label: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        throw new Error(`${label} is invalid.`);
    }
}

export async function createBrand(name: string) {
    const context = await requirePermission("products.create");
    const session = await getCurrentSession();
    if (!session) throw new Error("You must be authenticated.");

    const cleanName = name.trim().replace(/\s+/g, " ");
    if (!cleanName) return { ok: false as const, message: "Brand name is required." };
    if (cleanName.length > 100) {
        return { ok: false as const, message: "Brand name must not exceed 100 characters." };
    }

    try {
        await db.transaction(async (tx) => {
            const inserted = await tx.execute<{ id: string; name: string }>(sql`
                INSERT INTO brands (shop_id, name, active)
                VALUES (${context.shopId}, ${cleanName}, true)
                RETURNING id, name
            `);
            const brand = inserted.rows[0];
            if (!brand) throw new Error("Brand could not be created.");

            await tx.insert(auditLogs).values({
                shopId: context.shopId,
                actorUserId: session.user.id,
                action: "BRAND_CREATED",
                entityType: "BRAND",
                entityId: brand.id,
                metadata: { name: brand.name },
            });
        });
    } catch (error) {
        if (isPostgresConstraintViolation(error, "23505", "brands_shop_name_unique")) {
            return { ok: false as const, message: "A brand with this name already exists in this shop." };
        }
        logUnexpectedActionError("src/app/(dashboard)/settings/brands/actions.ts", error);
        return { ok: false as const, message: "Could not create the brand right now. Please try again." };
    }

    revalidatePath("/settings/brands");
    return { ok: true as const, message: "Brand created." };
}

export async function setBrandActive(brandId: string, active: boolean) {
    const context = await requirePermission("products.update");
    const session = await getCurrentSession();
    if (!session) throw new Error("You must be authenticated.");
    requireUuid(brandId, "Brand ID");

    await db.transaction(async (tx) => {
        const result = await tx.execute<{ id: string; name: string; active: boolean }>(sql`
            SELECT id, name, active
            FROM brands
            WHERE id = ${brandId} AND shop_id = ${context.shopId}
            LIMIT 1
            FOR UPDATE
        `);
        const brand = result.rows[0];
        if (!brand) throw new Error("Brand was not found in this shop.");
        if (brand.active === active) return;

        await tx.execute(sql`
            UPDATE brands SET active = ${active}, updated_at = now()
            WHERE id = ${brand.id} AND shop_id = ${context.shopId}
        `);
        await tx.insert(auditLogs).values({
            shopId: context.shopId,
            actorUserId: session.user.id,
            action: active ? "BRAND_ACTIVATED" : "BRAND_DEACTIVATED",
            entityType: "BRAND",
            entityId: brand.id,
            metadata: { name: brand.name, beforeActive: brand.active, afterActive: active },
        });
    });

    revalidatePath("/settings/brands");
}
