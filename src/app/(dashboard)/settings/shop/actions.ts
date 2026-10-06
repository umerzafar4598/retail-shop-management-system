"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/authorization";

type UpdateShopSettingsInput = {
    name: string;
    phone: string | null;
    address: string | null;
    receiptHeader: string | null;
    receiptFooter: string | null;
    logoUrl: string | null;
};

export async function updateShopSettings(
    input: UpdateShopSettingsInput,
) {
    const context = await requirePermission("shop.update");

    const name = input.name.trim();

    if (!name) {
        throw new Error("Shop name is required.");
    }

    await db.transaction(async (tx) => {
        await tx.execute(
            sql`
        UPDATE shops
        SET
          name = ${name},
          updated_at = now()
        WHERE id = ${context.shopId}
      `,
        );

        await tx.execute(
            sql`
        INSERT INTO shop_settings (
          shop_id,
          phone,
          address,
          receipt_header,
          receipt_footer,
          logo_url
        )
        VALUES (
          ${context.shopId},
          ${input.phone?.trim() || null},
          ${input.address?.trim() || null},
          ${input.receiptHeader?.trim() || null},
          ${input.receiptFooter?.trim() || null},
          ${input.logoUrl?.trim() || null}
        )
        ON CONFLICT (shop_id)
        DO UPDATE SET
          phone = EXCLUDED.phone,
          address = EXCLUDED.address,
          receipt_header = EXCLUDED.receipt_header,
          receipt_footer = EXCLUDED.receipt_footer,
          logo_url = EXCLUDED.logo_url,
          updated_at = now()
      `,
        );
    });

    revalidatePath("/settings/shop");
    revalidatePath("/dashboard");

    return {
        success: true,
    };
}