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

export async function createCategory(input: { name: string; parentId: string | null }) {
    const context = await requirePermission("products.create");
    const session = await getCurrentSession();
    if (!session) throw new Error("You must be authenticated.");

    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name) return { ok: false as const, message: "Category name is required." };
    if (name.length > 100) {
        return { ok: false as const, message: "Category name must not exceed 100 characters." };
    }
    if (input.parentId) requireUuid(input.parentId, "Parent category ID");

    try {
        const result = await db.transaction(async (tx) => {
            if (input.parentId) {
                const parent = await tx.execute(sql`
                    SELECT id FROM categories
                    WHERE id = ${input.parentId}
                      AND shop_id = ${context.shopId}
                      AND active = true
                    LIMIT 1 FOR UPDATE
                `);
                if (parent.rows.length === 0) {
                    return { ok: false as const, message: "Selected parent category is invalid." };
                }
            }

            const inserted = await tx.execute<{ id: string; name: string }>(sql`
                INSERT INTO categories (shop_id, parent_id, name, active)
                VALUES (${context.shopId}, ${input.parentId}, ${name}, true)
                RETURNING id, name
            `);
            const category = inserted.rows[0];
            if (!category) throw new Error("Category could not be created.");

            await tx.insert(auditLogs).values({
                shopId: context.shopId,
                actorUserId: session.user.id,
                action: "CATEGORY_CREATED",
                entityType: "CATEGORY",
                entityId: category.id,
                metadata: { name: category.name, parentId: input.parentId },
            });

            return { ok: true as const, message: "Category created." };
        });

        if (!result.ok) return result;
    } catch (error) {
        if (isPostgresConstraintViolation(error, "23505", "categories_shop_name_unique")) {
            return { ok: false as const, message: "A category with this name already exists in this shop." };
        }
        logUnexpectedActionError("src/app/(dashboard)/settings/categories/actions.ts", error);
        return { ok: false as const, message: "Could not create the category right now. Please try again." };
    }

    revalidatePath("/settings/categories");
    return { ok: true as const, message: "Category created." };
}

export async function setCategoryActive(categoryId: string, active: boolean) {
    const context = await requirePermission("products.update");
    const session = await getCurrentSession();
    if (!session) throw new Error("You must be authenticated.");
    requireUuid(categoryId, "Category ID");

    await db.transaction(async (tx) => {
        const result = await tx.execute<{ id: string; name: string; active: boolean }>(sql`
            SELECT id, name, active FROM categories
            WHERE id = ${categoryId} AND shop_id = ${context.shopId}
            LIMIT 1 FOR UPDATE
        `);
        const category = result.rows[0];
        if (!category) throw new Error("Category was not found in this shop.");
        if (category.active === active) return;

        await tx.execute(sql`
            UPDATE categories SET active = ${active}, updated_at = now()
            WHERE id = ${category.id} AND shop_id = ${context.shopId}
        `);
        await tx.insert(auditLogs).values({
            shopId: context.shopId,
            actorUserId: session.user.id,
            action: active ? "CATEGORY_ACTIVATED" : "CATEGORY_DEACTIVATED",
            entityType: "CATEGORY",
            entityId: category.id,
            metadata: { name: category.name, beforeActive: category.active, afterActive: active },
        });
    });

    revalidatePath("/settings/categories");
}
