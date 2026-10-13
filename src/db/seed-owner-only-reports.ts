import "dotenv/config";

import { sql } from "drizzle-orm";
import { db, pool } from "./client";

async function main() {
  await db.transaction(async (tx) => {
    const permissionResult = await tx.execute<{ id: string }>(sql`
      SELECT id
      FROM permissions
      WHERE key = 'reports.view'
      LIMIT 1
      FOR UPDATE
    `);
    const reportPermission = permissionResult.rows[0];
    if (!reportPermission) {
      throw new Error(
        "The reports.view permission does not exist. Run src/db/seed-phase14-permissions.ts first, then rerun this script.",
      );
    }

    const ownerResult = await tx.execute<{ id: string; shop_id: string; name: string }>(sql`
      SELECT id, shop_id, name
      FROM roles
      WHERE lower(trim(name)) = 'owner'
      FOR UPDATE
    `);
    if (ownerResult.rows.length === 0) {
      throw new Error("No Owner role was found; report grants were not changed.");
    }

    // Remove reports.view from all roles except the Owner role. Transaction-level
    // permissions such as sales.view and financial_accounts.view remain untouched.
    await tx.execute(sql`
      DELETE FROM role_permissions rp
      USING roles r
      WHERE rp.role_id = r.id
        AND rp.permission_id = ${reportPermission.id}
        AND lower(trim(r.name)) <> 'owner'
    `);

    await tx.execute(sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, ${reportPermission.id}
      FROM roles r
      WHERE lower(trim(r.name)) = 'owner'
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);

    const verification = await tx.execute<{ role_name: string; granted_count: number }>(sql`
      SELECT r.name AS role_name, COUNT(rp.permission_id)::int AS granted_count
      FROM roles r
      LEFT JOIN role_permissions rp
        ON rp.role_id = r.id
       AND rp.permission_id = ${reportPermission.id}
      GROUP BY r.id, r.name
      ORDER BY r.shop_id, r.name
    `);

    const invalid = verification.rows.filter(
      (row) => row.role_name.trim().toLowerCase() !== "owner" && row.granted_count > 0,
    );
    if (invalid.length > 0) {
      throw new Error("Verification failed: reports.view remains assigned to a non-owner role.");
    }

    console.log(`Owner-only reports.view policy applied to ${ownerResult.rows.length} Owner role(s).`);
    console.log("Manager and Cashier transaction-level permissions were not changed.");
  });
}

main()
  .catch((error) => {
    console.error("Failed to apply owner-only reports permissions:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
