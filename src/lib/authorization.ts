import "server-only";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { getCurrentSession } from "@/lib/session";

export type ShopContext = {
    shopId: string;
    shopName: string;
    shopSlug: string;
    roleId: string;
    roleName: string;
};

export async function getCurrentShopContext(): Promise<ShopContext | null> {
    const session = await getCurrentSession();

    if (!session) {
        return null;
    }

    const rows = await db.execute<ShopContext>(
        sql`
      SELECT
        sm.shop_id AS "shopId",
        s.name AS "shopName",
        s.slug AS "shopSlug",
        sm.role_id AS "roleId",
        r.name AS "roleName"
      FROM shop_memberships sm
      INNER JOIN shops s
        ON s.id = sm.shop_id
      INNER JOIN roles r
        ON r.id = sm.role_id
       AND r.shop_id = sm.shop_id
      WHERE sm.user_id = ${session.user.id}
        AND sm.status = 'ACTIVE'
        AND s.active = true
      ORDER BY sm.created_at ASC
      LIMIT 1
    `,
    );

    return rows.rows[0] ?? null;
}

export async function requireShopContext(): Promise<ShopContext> {
    const session = await getCurrentSession();

    if (!session) {
        redirect("/login");
    }

    const context = await getCurrentShopContext();

    if (!context) {
        redirect("/no-access");
    }

    return context;
}

export async function hasPermission(
    userId: string,
    shopId: string,
    permissionKey: string,
): Promise<boolean> {
    const rows = await db.execute<{ allowed: boolean }>(
        sql`
      SELECT EXISTS (
        SELECT 1
        FROM shop_memberships sm
        INNER JOIN roles r
          ON r.id = sm.role_id
         AND r.shop_id = sm.shop_id
        INNER JOIN role_permissions rp
          ON rp.role_id = r.id
        INNER JOIN permissions p
          ON p.id = rp.permission_id
        WHERE sm.user_id = ${userId}
          AND sm.shop_id = ${shopId}
          AND sm.status = 'ACTIVE'
          AND p.key = ${permissionKey}
      ) AS allowed
    `,
    );

    return Boolean(rows.rows[0]?.allowed);
}

export async function requirePermission(
    permissionKey: string,
): Promise<ShopContext> {
    const session = await getCurrentSession();

    if (!session) {
        redirect("/login");
    }

    const context = await getCurrentShopContext();

    if (!context) {
        redirect("/no-access");
    }

    const allowed = await hasPermission(
        session.user.id,
        context.shopId,
        permissionKey,
    );

    if (!allowed) {
        redirect("/forbidden");
    }

    return context;
}