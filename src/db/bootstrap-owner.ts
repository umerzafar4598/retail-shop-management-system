import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { sql } from "drizzle-orm";

import { db, pool } from "./client";

const PERMISSIONS = [
    ["dashboard.view", "View dashboard"],

    ["shop.read", "View shop"],
    ["shop.update", "Update shop settings"],

    ["user.view", "View users"],
    ["user.create", "Create users"],
    ["user.update", "Update users"],
    ["user.suspend", "Suspend users"],

    ["role.view", "View roles"],
    ["role.manage", "Manage roles"],

    ["products.view", "View products"],
    ["products.create", "Create products"],
    ["products.update", "Update products"],
    ["products.archive", "Archive products"],

    ["inventory.view", "View inventory"],
    ["inventory.purchase", "Receive purchased stock"],
    ["inventory.adjust", "Adjust inventory"],
    ["inventory.transfer", "Transfer inventory"],

    ["suppliers.view", "View suppliers"],
    ["suppliers.create", "Create suppliers"],
    ["suppliers.update", "Update suppliers"],

    ["sales.view", "View sales"],
    ["sales.create", "Create sales"],
    ["sales.void", "Void sales"],
    ["sales.return", "Process returns"],

    ["customers.view", "View customers"],
    ["customers.create", "Create customers"],
    ["customers.update", "Update customers"],

    ["services.view", "View services"],
    ["services.create", "Create service transactions"],
    ["services.update", "Update service transactions"],

    ["financial_accounts.view", "View financial accounts"],
    ["financial_accounts.manage", "Manage financial accounts"],

    ["ledger.view", "View ledger"],
    ["ledger.post", "Post ledger transactions"],

    ["cash.open", "Open cash session"],
    ["cash.close", "Close cash session"],
    ["cash.reconcile", "Reconcile cash"],

    ["expenses.view", "View expenses"],
    ["expenses.create", "Create expenses"],
    ["expenses.void", "Void expenses"],

    ["reports.view", "View reports"],
    ["audit.view", "View audit logs"],

    ["settings.manage", "Manage application settings"],
] as const;

async function main() {
    const rl = createInterface({
        input,
        output,
    });

    try {
        const ownerEmail = (
            await rl.question("Owner email: ")
        )
            .trim()
            .toLowerCase();

        const shopName = (
            await rl.question(
                "Shop name [Hamid Mobiles and Communications]: ",
            )
        ).trim() || "Hamid Mobiles and Communications";

        const shopSlug = (
            await rl.question("Shop slug [hamid-mobiles]: ")
        ).trim() || "hamid-mobiles";

        await db.transaction(async (tx) => {
            const users = await tx.execute<{
                id: string;
                email: string;
            }>(
                sql`
          SELECT id, email
          FROM "user"
          WHERE lower(email) = ${ownerEmail}
          LIMIT 1
        `,
            );

            const owner = users.rows[0];

            if (!owner) {
                throw new Error(
                    `No Better Auth user found for ${ownerEmail}.`,
                );
            }

            const existingShops = await tx.execute<{
                id: string;
                name: string;
                slug: string;
            }>(
                sql`
          SELECT id, name, slug
          FROM shops
          WHERE slug = ${shopSlug}
          LIMIT 1
        `,
            );

            let shopId: string;

            if (existingShops.rows.length > 0) {
                shopId = existingShops.rows[0].id;
            } else {
                const shops = await tx.execute<{
                    id: string;
                }>(
                    sql`
            INSERT INTO shops (
              name,
              slug,
              currency,
              timezone,
              active
            )
            VALUES (
              ${shopName},
              ${shopSlug},
              'PKR',
              'Asia/Karachi',
              true
            )
            RETURNING id
          `,
                );

                shopId = shops.rows[0].id;
            }

            const roles = [
                {
                    name: "Owner",
                    description: "Full shop access",
                },
                {
                    name: "Manager",
                    description: "Operational management access",
                },
                {
                    name: "Cashier",
                    description: "Sales and cash operations access",
                },
            ];

            let ownerRoleId: string;

            for (const role of roles) {
                const existing = await tx.execute<{
                    id: string;
                }>(
                    sql`
            SELECT id
            FROM roles
            WHERE shop_id = ${shopId}
              AND name = ${role.name}
            LIMIT 1
          `,
                );

                if (existing.rows.length === 0) {
                    const created = await tx.execute<{
                        id: string;
                    }>(
                        sql`
              INSERT INTO roles (
                shop_id,
                name,
                description,
                is_system
              )
              VALUES (
                ${shopId},
                ${role.name},
                ${role.description},
                true
              )
              RETURNING id
            `,
                    );

                    if (role.name === "Owner") {
                        ownerRoleId = created.rows[0].id;
                    }
                } else if (role.name === "Owner") {
                    ownerRoleId = existing.rows[0].id;
                }
            }

            if (!ownerRoleId!) {
                throw new Error("Owner role could not be created or found.");
            }

            for (const [key, description] of PERMISSIONS) {
                await tx.execute(
                    sql`
            INSERT INTO permissions (
              key,
              description
            )
            VALUES (
              ${key},
              ${description}
            )
            ON CONFLICT (key)
            DO UPDATE SET description = EXCLUDED.description
          `,
                );
            }

            await tx.execute(
                sql`
          INSERT INTO role_permissions (
            role_id,
            permission_id
          )
          SELECT
            ${ownerRoleId},
            p.id
          FROM permissions p
          ON CONFLICT (role_id, permission_id)
          DO NOTHING
        `,
            );

            await tx.execute(
                sql`
          INSERT INTO shop_memberships (
            shop_id,
            user_id,
            role_id,
            status
          )
          VALUES (
            ${shopId},
            ${owner.id},
            ${ownerRoleId},
            'ACTIVE'
          )
          ON CONFLICT (shop_id, user_id)
          DO UPDATE SET
            role_id = EXCLUDED.role_id,
            status = 'ACTIVE',
            updated_at = now()
        `,
            );

            console.log("\nBootstrap completed successfully.");
            console.log("Shop ID:", shopId);
            console.log("Owner user ID:", owner.id);
            console.log("Owner role ID:", ownerRoleId);
        });
    } finally {
        rl.close();
        await pool.end();
    }
}

main().catch((error) => {
    console.error("\nBootstrap failed.");

    if (error instanceof Error) {
        console.error(error.message);
    } else {
        console.error(error);
    }

    process.exitCode = 1;
});