import "dotenv/config";

import { sql } from "drizzle-orm";
import { db, pool } from "./client";

/**
 * Idempotently adds the dedicated Phase 14.2 workflow permissions.
 * Owner and Manager receive the full dedicated set. Cashier and Staff receive
 * intentionally limited operational permissions. Legacy products.view and
 * unrelated grants are preserved; products.create/update are removed from
 * Cashier and Staff so catalog administration is not inherited from the old
 * broad permissions.
 *
 * Run after deploying this change with:
 *   npx tsx src/db/seed-phase14-permissions.ts
 */
const permissionDefinitions = [
  ["sales.view", "View completed sales and receipts"],
  ["sales.create", "Create and complete POS sales"],
  ["sales.return", "Process sale returns and refunds"],
  ["sales.exchange", "Process linked sale exchanges"],
  ["sales.collect_payment", "Collect outstanding customer sale balances"],
  ["customers.view", "View customer profiles and balances"],
  ["customers.create", "Create customer records"],
  ["purchases.view", "View purchase documents"],
  ["purchases.create", "Create purchase drafts"],
  ["purchases.edit_draft", "Edit purchase drafts"],
  ["purchases.cancel_draft", "Cancel purchase drafts"],
  ["purchases.post", "Post purchases and receive inventory"],
  ["purchases.record_payment", "Record payments against supplier payables"],
  ["services.view", "View shop service transactions"],
  ["services.create", "Create shop service transactions"],
  ["services.process", "Move pending services to processing"],
  ["services.complete", "Complete provider service transactions"],
  ["services.cancel", "Fail or cancel services and post required refunds"],
  ["services.manage_types", "Configure service types and default fees"],
  ["expenses.view", "View expense documents"],
  ["expenses.create", "Post expenses"],
  ["expenses.reverse", "Reverse or correct posted expenses"],
  ["expenses.manage_categories", "Manage expense categories and ledger mappings"],
  ["cash_sessions.view", "View cash drawer sessions and reconciliations"],
  ["cash_sessions.open", "Open cash drawer sessions"],
  ["cash_sessions.close", "Close cash drawer sessions and record counts"],
  ["cash_sessions.reconcile", "Review cash session discrepancies"],
  ["cash_drawers.manage", "Configure Retail and Services drawer defaults"],
  ["suppliers.view", "View supplier records"],
  ["suppliers.create", "Create supplier records"],
  ["suppliers.update", "Update supplier status and details"],
  ["reports.view", "View management and inventory reports"],
] as const;

const managerAndOwnerKeys = permissionDefinitions.map(([key]) => key);

const cashierKeys = [
  "sales.view",
  "sales.create",
  "sales.collect_payment",
  "customers.view",
  "customers.create",
  "services.view",
  "services.create",
  "services.process",
  "services.complete",
  "cash_sessions.view",
  "cash_sessions.open",
  "cash_sessions.close",
] as const;

// Staff can perform routine operational work, but cannot collect customer
// balances, process returns/exchanges, manage cash sessions, or change master
// data without an explicit grant through a future role-management workflow.
const staffKeys = [
  "sales.view",
  "sales.create",
  "customers.view",
  "customers.create",
  "services.view",
  "services.create",
  "services.process",
  "services.complete",
  "cash_sessions.view",
] as const;

const legacyCatalogMutationKeys = ["products.create", "products.update"] as const;

async function main() {
  await db.transaction(async (tx) => {
    const permissionValues = sql.join(
      permissionDefinitions.map(([key, description]) => sql`(${key}, ${description})`),
      sql`, `,
    );

    await tx.execute(sql`
      INSERT INTO permissions ("key", description)
      VALUES ${permissionValues}
      ON CONFLICT ("key") DO NOTHING
    `);

    const keys = permissionDefinitions.map(([key]) => key);
    const permissionRows = await tx.execute<{ id: string; key: string }>(sql`
      SELECT id::text AS id, "key"
      FROM permissions
      WHERE "key" IN (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
    `);
    const permissionIdByKey = new Map(
      permissionRows.rows.map((row) => [row.key, row.id]),
    );

    const roleRows = await tx.execute<{ id: string; name: string }>(sql`
      SELECT id::text AS id, name
      FROM roles
      WHERE is_system = true
        AND lower(trim(name)) IN ('owner', 'manager', 'cashier', 'staff')
    `);

    const assignedSummary: string[] = [];
    for (const role of roleRows.rows) {
      const roleName = role.name.trim().toLowerCase();
      const grantKeys = roleName === "cashier"
        ? [...cashierKeys]
        : roleName === "staff"
          ? [...staffKeys]
          : managerAndOwnerKeys;

      // Normalize dedicated operational grants for limited roles so rerunning
      // this seed cannot silently expand Cashier/Staff privileges.
      if (roleName === "cashier" || roleName === "staff") {
        await tx.execute(sql`
          DELETE FROM role_permissions rp
          USING permissions p
          WHERE rp.permission_id = p.id
            AND rp.role_id = ${role.id}::uuid
            AND p."key" IN (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
        `);

        // The old app used products.update for sales, services, expenses,
        // and purchase operations. Those guards are now domain-specific, so
        // limited roles must not retain catalog mutation via legacy grants.
        await tx.execute(sql`
          DELETE FROM role_permissions rp
          USING permissions p
          WHERE rp.permission_id = p.id
            AND rp.role_id = ${role.id}::uuid
            AND p."key" IN (${sql.join(legacyCatalogMutationKeys.map((key) => sql`${key}`), sql`, `)})
        `);
      }

      for (const key of grantKeys) {
        const permissionId = permissionIdByKey.get(key);
        if (!permissionId) {
          throw new Error(`Permission key ${key} was not found after seeding.`);
        }

        await tx.execute(sql`
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES (${role.id}::uuid, ${permissionId}::uuid)
          ON CONFLICT (role_id, permission_id) DO NOTHING
        `);
      }
      assignedSummary.push(`${role.name}: ${grantKeys.length} dedicated grants`);
    }

    const foundRoleNames = new Set(roleRows.rows.map((role) => role.name.trim().toLowerCase()));
    for (const requiredRole of ["owner", "manager"] as const) {
      if (!foundRoleNames.has(requiredRole)) {
        throw new Error(`Required system role '${requiredRole}' was not found. No permission changes were committed.`);
      }
    }
    if (!foundRoleNames.has("cashier")) {
      console.warn("No system Cashier role found; no Cashier-specific grants were assigned.");
    }
    if (!foundRoleNames.has("staff")) {
      console.warn("No system Staff role found; no Staff-specific grants were assigned.");
    }

    console.log(`Ensured ${permissionDefinitions.length} dedicated permissions exist.`);
    console.log(assignedSummary.length ? assignedSummary.join("\n") : "No matching system roles were found.");
    console.log("Cashier and Staff receive only their listed grants from the dedicated permission set, and legacy products.create/products.update grants are removed from those roles. Unrelated grants are preserved.");
  });
}

main()
  .catch((error: unknown) => {
    console.error("Phase 14.2 permission seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
