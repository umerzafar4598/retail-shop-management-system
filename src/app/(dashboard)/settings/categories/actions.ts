"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/authorization";
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
    if (!name) throw new Error("Category name is required.");
    if (name.length > 100) throw new Error("Category name must not exceed 100 characters.");
    if (input.parentId) requireUuid(input.parentId, "Parent category ID");

    await db.transaction(async (tx) => {
        if (input.parentId) {
            const parent = await tx.execute(sql`
                SELECT id FROM categories
                WHERE id = ${input.parentId} AND shop_id = ${context.shopId} AND active = true
                LIMIT 1 FOR UPDATE
            `);
            if (parent.rows.length === 0) throw new Error("Selected parent category is invalid.");
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
    });

    revalidatePath("/settings/categories");
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
