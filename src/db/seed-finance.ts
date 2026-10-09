import "dotenv/config";

import { sql } from "drizzle-orm";

import { db, pool } from "./client";

const FINANCE_PERMISSIONS = [
    "financial_accounts.view",
    "financial_accounts.create",
    "financial_accounts.update",
    "financial_accounts.deactivate",
    "financial_accounts.opening_balance",
    "ledger.view",
    "account_transfers.view",
    "account_transfers.create",
] as const;

const MANAGER_FINANCE_PERMISSIONS = [
    "financial_accounts.view",
    "financial_accounts.create",
    "financial_accounts.update",
    "financial_accounts.deactivate",
    "ledger.view",
    "account_transfers.view",
    "account_transfers.create",
] as const;

const CASHIER_FINANCE_PERMISSIONS = [
    "financial_accounts.view",
] as const;

type PermissionKey = (typeof FINANCE_PERMISSIONS)[number];

type LedgerSeed = {
    code: string;
    name: string;
    accountType: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
    normalBalance: "DEBIT" | "CREDIT";
    systemKey: string;
};

const LEDGER_SEED: readonly LedgerSeed[] = [
    {
        code: "1000",
        name: "Cash Drawer",
        accountType: "ASSET",
        normalBalance: "DEBIT",
        systemKey: "CASH_DRAWER",
    },
    {
        code: "1100",
        name: "Digital Wallets",
        accountType: "ASSET",
        normalBalance: "DEBIT",
        systemKey: "DIGITAL_WALLETS",
    },
    {
        code: "1150",
        name: "Bank Accounts",
        accountType: "ASSET",
        normalBalance: "DEBIT",
        systemKey: "BANK_ACCOUNTS",
    },
    {
        code: "1190",
        name: "Other Financial Assets",
        accountType: "ASSET",
        normalBalance: "DEBIT",
        systemKey: "OTHER_FINANCIAL_ASSETS",
    },
    {
        code: "1200",
        name: "Inventory",
        accountType: "ASSET",
        normalBalance: "DEBIT",
        systemKey: "INVENTORY",
    },
    {
        code: "1300",
        name: "Accounts Receivable",
        accountType: "ASSET",
        normalBalance: "DEBIT",
        systemKey: "ACCOUNTS_RECEIVABLE",
    },
    {
        code: "2000",
        name: "Accounts Payable",
        accountType: "LIABILITY",
        normalBalance: "CREDIT",
        systemKey: "ACCOUNTS_PAYABLE",
    },
    {
        code: "3000",
        name: "Owner Capital",
        accountType: "EQUITY",
        normalBalance: "CREDIT",
        systemKey: "OWNER_CAPITAL",
    },
    {
        code: "3100",
        name: "Owner Drawings",
        accountType: "EQUITY",
        normalBalance: "DEBIT",
        systemKey: "OWNER_DRAWINGS",
    },
    {
        code: "3900",
        name: "Opening Balance Equity",
        accountType: "EQUITY",
        normalBalance: "CREDIT",
        systemKey: "OPENING_BALANCE_EQUITY",
    },
    {
        code: "4000",
        name: "Product Sales",
        accountType: "REVENUE",
        normalBalance: "CREDIT",
        systemKey: "PRODUCT_SALES",
    },
    {
        code: "4100",
        name: "Service Revenue",
        accountType: "REVENUE",
        normalBalance: "CREDIT",
        systemKey: "SERVICE_REVENUE",
    },
    {
        code: "4900",
        name: "Sales Returns",
        accountType: "REVENUE",
        normalBalance: "DEBIT",
        systemKey: "SALES_RETURNS",
    },
    {
        code: "5000",
        name: "Cost of Goods Sold",
        accountType: "EXPENSE",
        normalBalance: "DEBIT",
        systemKey: "COGS",
    },
    {
        code: "6000",
        name: "Electricity",
        accountType: "EXPENSE",
        normalBalance: "DEBIT",
        systemKey: "EXPENSE_ELECTRICITY",
    },
    {
        code: "6010",
        name: "Internet",
        accountType: "EXPENSE",
        normalBalance: "DEBIT",
        systemKey: "EXPENSE_INTERNET",
    },
    {
        code: "6020",
        name: "Rent",
        accountType: "EXPENSE",
        normalBalance: "DEBIT",
        systemKey: "EXPENSE_RENT",
    },
    {
        code: "6030",
        name: "Salary",
        accountType: "EXPENSE",
        normalBalance: "DEBIT",
        systemKey: "EXPENSE_SALARY",
    },
    {
        code: "6040",
        name: "Maintenance",
        accountType: "EXPENSE",
        normalBalance: "DEBIT",
        systemKey: "EXPENSE_MAINTENANCE",
    },
    {
        code: "6050",
        name: "Miscellaneous",
        accountType: "EXPENSE",
        normalBalance: "DEBIT",
        systemKey: "EXPENSE_MISC",
    },
];

async function ensurePermissions() {
    for (const key of FINANCE_PERMISSIONS) {
        await db.execute(sql`
      INSERT INTO permissions (key, description)
      VALUES (
        ${key},
        ${getPermissionDescription(key)}
      )
      ON CONFLICT (key) DO NOTHING
    `);
    }
}

function getPermissionDescription(key: PermissionKey) {
    switch (key) {
        case "financial_accounts.view":
            return "View shop financial accounts.";
        case "financial_accounts.create":
            return "Create shop financial accounts.";
        case "financial_accounts.update":
            return "Update shop financial account information.";
        case "financial_accounts.deactivate":
            return "Deactivate or reactivate shop financial accounts.";
        case "financial_accounts.opening_balance":
            return "Set opening balances for shop financial accounts.";
        case "ledger.view":
            return "View the shop accounting ledger.";
        case "account_transfers.view":
            return "View transfers between shop financial accounts.";
        case "account_transfers.create":
            return "Transfer money between shop financial accounts.";
    }
}

async function assignRolePermissions(
    shopId: string,
    roleName: string,
    permissionKeys: readonly string[],
) {
    const roleResult = await db.execute<{ id: string }>(sql`
    SELECT id
    FROM roles
    WHERE shop_id = ${shopId}
      AND name = ${roleName}
    LIMIT 1
  `);

    const role = roleResult.rows[0];

    if (!role) {
        throw new Error(`Role "${roleName}" does not exist for this shop.`);
    }

    for (const key of permissionKeys) {
        await db.execute(sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT
        ${role.id},
        p.id
      FROM permissions p
      WHERE p.key = ${key}
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);
    }

    console.log(
        `${roleName}: ${permissionKeys.length} finance permissions assigned.`,
    );
}

async function seedLedgerAccounts(shopId: string) {
    for (const account of LEDGER_SEED) {
        await db.execute(sql`
      INSERT INTO ledger_accounts (
        shop_id,
        code,
        name,
        account_type,
        normal_balance,
        system_key,
        is_system,
        active
      )
      VALUES (
        ${shopId},
        ${account.code},
        ${account.name},
        ${account.accountType},
        ${account.normalBalance},
        ${account.systemKey},
        true,
        true
      )
      ON CONFLICT (shop_id, system_key)
      DO NOTHING
    `);
    }

    console.log(
        `${LEDGER_SEED.length} system ledger accounts verified.`,
    );
}

async function ensureMainCashDrawer(shopId: string) {
    const ledgerResult = await db.execute<{ id: string }>(sql`
    SELECT id
    FROM ledger_accounts
    WHERE shop_id = ${shopId}
      AND system_key = 'CASH_DRAWER'
    LIMIT 1
  `);

    const cashLedger = ledgerResult.rows[0];

    if (!cashLedger) {
        throw new Error("CASH_DRAWER ledger account was not created.");
    }

    const existingFinancialAccount = await db.execute<{ id: string }>(sql`
    SELECT fa.id
    FROM financial_accounts fa
    INNER JOIN ledger_accounts la
      ON la.id = fa.ledger_account_id
    WHERE fa.shop_id = ${shopId}
      AND la.shop_id = ${shopId}
      AND la.system_key = 'CASH_DRAWER'
    LIMIT 1
  `);

    if (existingFinancialAccount.rows[0]) {
        console.log("Main cash drawer already exists.");
        return;
    }

    await db.execute(sql`
    INSERT INTO financial_accounts (
      shop_id,
      ledger_account_id,
      name,
      kind,
      provider,
      identifier,
      is_active
    )
    VALUES (
      ${shopId},
      ${cashLedger.id},
      'Main Cash Drawer',
      'CASH',
      'INTERNAL',
      NULL,
      true
    )
  `);

    console.log("Main cash drawer created.");
}

async function main() {
    const shopResult = await db.execute<{
        id: string;
        name: string;
    }>(sql`
    SELECT id, name
    FROM shops
    WHERE slug = 'hamid-mobiles'
      AND active = true
    LIMIT 1
  `);

    const shop = shopResult.rows[0];

    if (!shop) {
        throw new Error(
            'Shop with slug "hamid-mobiles" was not found.',
        );
    }

    console.log(`Finance bootstrap for: ${shop.name}`);

    await db.transaction(async (tx) => {
        for (const key of FINANCE_PERMISSIONS) {
            await tx.execute(sql`
        INSERT INTO permissions (key, description)
        VALUES (
          ${key},
          ${getPermissionDescription(key)}
        )
        ON CONFLICT (key) DO NOTHING
      `);
        }

        for (const [roleName, permissionKeys] of [
            ["Manager", MANAGER_FINANCE_PERMISSIONS],
            ["Cashier", CASHIER_FINANCE_PERMISSIONS],
        ] as const) {
            const roleResult = await tx.execute<{ id: string }>(sql`
        SELECT id
        FROM roles
        WHERE shop_id = ${shop.id}
          AND name = ${roleName}
        LIMIT 1
      `);

            const role = roleResult.rows[0];

            if (!role) {
                throw new Error(
                    `Role "${roleName}" does not exist for this shop.`,
                );
            }

            for (const key of permissionKeys) {
                await tx.execute(sql`
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT
            ${role.id},
            p.id
          FROM permissions p
          WHERE p.key = ${key}
          ON CONFLICT (role_id, permission_id) DO NOTHING
        `);
            }
        }
    });

    await seedLedgerAccounts(shop.id);
    await ensureMainCashDrawer(shop.id);

    const ownerRoleResult = await db.execute<{ id: string }>(sql`
    SELECT id
    FROM roles
    WHERE shop_id = ${shop.id}
      AND name = 'Owner'
    LIMIT 1
  `);

    const ownerRole = ownerRoleResult.rows[0];

    if (!ownerRole) {
        throw new Error('Owner role does not exist for this shop.');
    }

    for (const key of FINANCE_PERMISSIONS) {
        await db.execute(sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT
        ${ownerRole.id},
        p.id
      FROM permissions p
      WHERE p.key = ${key}
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);
    }

    console.log("Owner: finance permissions verified.");
    console.log("Finance foundation bootstrap completed.");
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });