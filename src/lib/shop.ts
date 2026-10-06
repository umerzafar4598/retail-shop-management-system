import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/authorization";

export type ShopSettings = {
    shopId: string;
    name: string;
    slug: string;
    currency: string;
    timezone: string;
    phone: string | null;
    address: string | null;
    receiptHeader: string | null;
    receiptFooter: string | null;
    logoUrl: string | null;
};

export async function getCurrentShop(): Promise<ShopSettings> {
    const context = await requirePermission("shop.read");

    const result = await db.execute<ShopSettings>(
        sql`
      SELECT
        s.id AS "shopId",
        s.name,
        s.slug,
        s.currency,
        s.timezone,
        ss.phone,
        ss.address,
        ss.receipt_header AS "receiptHeader",
        ss.receipt_footer AS "receiptFooter",
        ss.logo_url AS "logoUrl"
      FROM shops s
      LEFT JOIN shop_settings ss
        ON ss.shop_id = s.id
      WHERE s.id = ${context.shopId}
        AND s.active = true
      LIMIT 1
    `,
    );

    const shop = result.rows[0];

    if (!shop) {
        throw new Error("Current shop could not be found.");
    }

    return shop;
}