"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/authorization";

export async function createCategory(input: {
    name: string;
    parentId: string | null;
}) {
    const context = await requirePermission("products.create");

    const name = input.name.trim();

    if (!name) {
        throw new Error("Category name is required.");
    }

    if (input.parentId) {
        const parent = await db.execute(
            sql`
        SELECT id
        FROM categories
        WHERE id = ${input.parentId}
          AND shop_id = ${context.shopId}
          AND active = true
        LIMIT 1
      `,
        );

        if (parent.rows.length === 0) {
            throw new Error("Selected parent category is invalid.");
        }
    }

    await db.execute(
        sql`
      INSERT INTO categories (
        shop_id,
        parent_id,
        name,
        active
      )
      VALUES (
        ${context.shopId},
        ${input.parentId},
        ${name},
        true
      )
    `,
    );

    revalidatePath("/settings/categories");
}

export async function setCategoryActive(
    categoryId: string,
    active: boolean,
) {
    const context = await requirePermission("products.update");

    await db.execute(
        sql`
      UPDATE categories
      SET
        active = ${active},
        updated_at = now()
      WHERE id = ${categoryId}
        AND shop_id = ${context.shopId}
    `,
    );

    revalidatePath("/settings/categories");
}