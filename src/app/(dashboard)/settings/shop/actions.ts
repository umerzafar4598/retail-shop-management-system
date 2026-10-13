"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/authorization";
import { getCurrentSession } from "@/lib/session";

type UpdateShopSettingsInput = {
    name: string;
    phone: string | null;
    address: string | null;
    receiptHeader: string | null;
    receiptFooter: string | null;
    logoUrl: string | null;
};

function optionalText(value: unknown, field: string, maxLength: number): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") throw new Error(`${field} must be text.`);
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) throw new Error(`${field} must not exceed ${maxLength} characters.`);
    return normalized;
}

export async function updateShopSettings(input: UpdateShopSettingsInput) {
    const context = await requirePermission("shop.update");
    const session = await getCurrentSession();
    if (!session) throw new Error("You must be authenticated.");
    if (!input || typeof input !== "object") throw new Error("Shop settings are invalid.");

    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Shop name is required.");
    if (name.length > 150) throw new Error("Shop name must not exceed 150 characters.");

    const phone = optionalText(input.phone, "Phone", 50);
    const address = optionalText(input.address, "Address", 1000);
    const receiptHeader = optionalText(input.receiptHeader, "Receipt header", 500);
    const receiptFooter = optionalText(input.receiptFooter, "Receipt footer", 500);
    const logoUrl = optionalText(input.logoUrl, "Logo URL", 1000);

    await db.transaction(async (tx) => {
        const shopResult = await tx.execute<{ name: string }>(sql`
            SELECT name FROM shops WHERE id = ${context.shopId} LIMIT 1 FOR UPDATE
        `);
        const previousShop = shopResult.rows[0];
        if (!previousShop) throw new Error("Shop was not found.");

        const settingsResult = await tx.execute<{
            phone: string | null;
            address: string | null;
            receiptHeader: string | null;
            receiptFooter: string | null;
            logoUrl: string | null;
        }>(sql`
            SELECT
              phone,
              address,
              receipt_header AS "receiptHeader",
              receipt_footer AS "receiptFooter",
              logo_url AS "logoUrl"
            FROM shop_settings
            WHERE shop_id = ${context.shopId}
            LIMIT 1
            FOR UPDATE
        `);
        const previousSettings = settingsResult.rows[0] ?? {
            phone: null,
            address: null,
            receiptHeader: null,
            receiptFooter: null,
            logoUrl: null,
        };

        const changedFields: string[] = [];
        if (previousShop.name !== name) changedFields.push("name");
        if (previousSettings.phone !== phone) changedFields.push("phone");
        if (previousSettings.address !== address) changedFields.push("address");
        if (previousSettings.receiptHeader !== receiptHeader) changedFields.push("receiptHeader");
        if (previousSettings.receiptFooter !== receiptFooter) changedFields.push("receiptFooter");
        if (previousSettings.logoUrl !== logoUrl) changedFields.push("logoUrl");

        await tx.execute(sql`
            UPDATE shops SET name = ${name}, updated_at = now()
            WHERE id = ${context.shopId}
        `);
        await tx.execute(sql`
            INSERT INTO shop_settings (
              shop_id, phone, address, receipt_header, receipt_footer, logo_url
            )
            VALUES (
              ${context.shopId}, ${phone}, ${address}, ${receiptHeader}, ${receiptFooter}, ${logoUrl}
            )
            ON CONFLICT (shop_id)
            DO UPDATE SET
              phone = EXCLUDED.phone,
              address = EXCLUDED.address,
              receipt_header = EXCLUDED.receipt_header,
              receipt_footer = EXCLUDED.receipt_footer,
              logo_url = EXCLUDED.logo_url,
              updated_at = now()
        `);

        if (changedFields.length > 0) {
            await tx.insert(auditLogs).values({
                shopId: context.shopId,
                actorUserId: session.user.id,
                action: "SHOP_SETTINGS_UPDATED",
                entityType: "SHOP_SETTINGS",
                entityId: context.shopId,
                metadata: {
                    changedFields,
                    beforeShopName: previousShop.name,
                    afterShopName: name,
                },
            });
        }
    });

    revalidatePath("/settings/shop");
    revalidatePath("/dashboard");
    return { success: true };
}
