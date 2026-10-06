import "dotenv/config";

import { sql } from "drizzle-orm";

import { db, pool } from "./client";

const MANAGER_PERMISSIONS = [
    "dashboard.view",

    "shop.read",

    "user.view",

    "products.view",
    "products.create",
    "products.update",

    "inventory.view",
    "inventory.purchase",
    "inventory.adjust",

    "suppliers.view",
    "suppliers.create",
    "suppliers.update",

    "sales.view",
    "sales.create",
    "sales.void",
    "sales.return",

    "customers.view",
    "customers.create",
    "customers.update",

    "services.view",
    "services.create",
    "services.update",

    "financial_accounts.view",

    "ledger.view",

    "cash.open",
    "cash.close",
    "cash.reconcile",

    "expenses.view",
    "expenses.create",

    "reports.view",

    "audit.view",
] as const;

const CASHIER_PERMISSIONS = [
    "dashboard.view",

    "shop.read",

    "products.view",

    "inventory.view",

    "sales.view",
    "sales.create",

    "customers.view",
    "customers.create",
    "customers.update",

    "services.view",
    "services.create",

    "cash.open",
    "cash.close",
    "cash.reconcile",
] as const;

async function assignPermissions(
    shopId: string,
    roleName: "Manager" | "Cashier",
    permissionKeys: readonly string[],
) {
    const roleResult = await db.execute<{
        id: string;
    }>(
        sql`
      SELECT id
      FROM roles
      WHERE shop_id = ${shopId}
        AND name = ${roleName}
      LIMIT 1
    `,
    );

    const role = roleResult.rows[0];

    if (!role) {
        throw new Error(
            `${roleName} role not found for shop ${shopId}.`,
        );
    }

    for (const key of permissionKeys) {
        await db.execute(
            sql`
        INSERT INTO role_permissions (
          role_id,
          permission_id
        )
        SELECT
          ${role.id},
          p.id
        FROM permissions p
        WHERE p.key = ${key}
        ON CONFLICT (role_id, permission_id)
        DO NOTHING
      `,
        );
    }

    console.log(
        `${roleName}: ${permissionKeys.length} permissions assigned.`,
    );
}

async function main() {
    const shopResult = await db.execute<{
        id: string;
        name: string;
    }>(
        sql`
      SELECT id, name
      FROM shops
      WHERE slug = 'hamid-mobiles'
      LIMIT 1
    `,
    );

    const shop = shopResult.rows[0];

    if (!shop) {
        throw new Error(
            "Hamid Mobiles shop was not found.",
        );
    }

    await db.transaction(async () => {
        await assignPermissions(
            shop.id,
            "Manager",
            MANAGER_PERMISSIONS,
        );

        await assignPermissions(
            shop.id,
            "Cashier",
            CASHIER_PERMISSIONS,
        );
    });

    console.log("\nRole permission seeding completed.");
    console.log("Shop:", shop.name);
}

main()
    .catch((error) => {
        console.error("\nRole permission seeding failed.");

        if (error instanceof Error) {
            console.error(error.message);
        } else {
            console.error(error);
        }

        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });