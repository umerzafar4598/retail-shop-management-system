"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/authorization";

export async function createBrand(name: string) {
    const context = await requirePermission("products.create");

    const cleanName = name.trim();

    if (!cleanName) {
        throw new Error("Brand name is required.");
    }

    await db.execute(
        sql`
      INSERT INTO brands (
        shop_id,
        name,
        active
      )
      VALUES (
        ${context.shopId},
        ${cleanName},
        true
      )
    `,
    );

    revalidatePath("/settings/brands");
}

export async function setBrandActive(
    brandId: string,
    active: boolean,
) {
    const context = await requirePermission("products.update");

    await db.execute(
        sql`
      UPDATE brands
      SET
        active = ${active},
        updated_at = now()
      WHERE id = ${brandId}
        AND shop_id = ${context.shopId}
    `,
    );

    revalidatePath("/settings/brands");
}