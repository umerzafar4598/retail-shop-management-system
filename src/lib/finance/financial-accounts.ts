import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/authorization";

export const FINANCIAL_ACCOUNT_KINDS = [
    "CASH",
    "DIGITAL_WALLET",
    "BANK",
    "OTHER",
] as const;

export type FinancialAccountKind =
    (typeof FINANCIAL_ACCOUNT_KINDS)[number];

export type FinancialAccount = {
    id: string;
    shopId: string;
    ledgerAccountId: string;
    name: string;
    kind: FinancialAccountKind;
    provider: string;
    identifier: string | null;
    isActive: boolean;
    balance: string;
    ledgerAccountActive: boolean;
    ledgerAccountIsSystem: boolean;
};

export type CreateFinancialAccountInput = {
    name: string;
    kind: FinancialAccountKind;
    provider: string;
    identifier?: string;
};

export type UpdateFinancialAccountInput = {
    financialAccountId: string;
    name: string;
    provider: string;
    identifier?: string;
};

type ParentLedger = {
    id: string;
    code: string;
    name: string;
};

type DbExecutor = {
    execute: typeof db.execute;
};

const PARENT_SYSTEM_KEYS: Record<
    Exclude<FinancialAccountKind, "CASH">,
    string
> = {
    DIGITAL_WALLET: "DIGITAL_WALLETS",
    BANK: "BANK_ACCOUNTS",
    OTHER: "OTHER_FINANCIAL_ASSETS",
};

function validateKind(kind: string): asserts kind is FinancialAccountKind {
    if (
        !FINANCIAL_ACCOUNT_KINDS.includes(
            kind as FinancialAccountKind,
        )
    ) {
        throw new Error("Invalid financial account type.");
    }
}

function normalizeCreateInput(
    input: CreateFinancialAccountInput,
) {
    const name = input.name.trim();
    const provider = input.provider.trim();
    const identifier = input.identifier?.trim() || null;

    if (!name) {
        throw new Error("Account name is required.");
    }

    if (name.length > 100) {
        throw new Error("Account name must not exceed 100 characters.");
    }

    validateKind(input.kind);

    if (!provider && input.kind !== "CASH") {
        throw new Error("Provider is required.");
    }

    if (
        (input.kind === "DIGITAL_WALLET" ||
            input.kind === "BANK") &&
        !identifier
    ) {
        throw new Error(
            "An identifier is required for wallet and bank accounts.",
        );
    }

    if (provider.length > 100) {
        throw new Error("Provider must not exceed 100 characters.");
    }

    if (identifier && identifier.length > 100) {
        throw new Error(
            "Identifier must not exceed 100 characters.",
        );
    }

    return {
        name,
        provider:
            provider || (input.kind === "CASH" ? "INTERNAL" : provider),
        identifier,
    };
}

function normalizeUpdateInput(
    input: UpdateFinancialAccountInput,
    kind: FinancialAccountKind,
) {
    const name = input.name.trim();
    const provider = input.provider.trim();
    const identifier = input.identifier?.trim() || null;

    if (!name) {
        throw new Error("Account name is required.");
    }

    if (!provider) {
        throw new Error("Provider is required.");
    }

    if (name.length > 100) {
        throw new Error("Account name must not exceed 100 characters.");
    }

    if (provider.length > 100) {
        throw new Error("Provider must not exceed 100 characters.");
    }

    if (identifier && identifier.length > 100) {
        throw new Error(
            "Identifier must not exceed 100 characters.",
        );
    }

    if (
        (kind === "DIGITAL_WALLET" || kind === "BANK") &&
        !identifier
    ) {
        throw new Error(
            "An identifier is required for wallet and bank accounts.",
        );
    }

    return {
        name,
        provider,
        identifier,
    };
}

async function getNextLedgerCode(
    tx: DbExecutor,
    shopId: string,
    parentId: string,
    parentCode: string,
) {
    const result = await tx.execute<{ nextCode: string }>(sql`
    SELECT
      (
        GREATEST(
          COALESCE(
            MAX(
              CASE
                WHEN code ~ '^[0-9]+$'
                THEN code::integer
              END
            ),
            ${Number(parentCode)}
          ),
          ${Number(parentCode)}
        ) + 1
      )::text AS "nextCode"
    FROM ledger_accounts
    WHERE shop_id = ${shopId}
      AND parent_id = ${parentId}
  `);

    const nextCode = result.rows[0]?.nextCode;

    if (!nextCode) {
        throw new Error(
            "Unable to generate a ledger account code.",
        );
    }

    return nextCode;
}

/**
 * Creates/loads a dedicated non-postable parent for additional cash drawers.
 * The existing Main Cash Drawer ledger account is deliberately not used as a
 * parent, because it already contains historical postings and must remain a
 * postable leaf account.
 */
async function getOrCreateCashDrawersParent(
    tx: DbExecutor,
    shopId: string,
): Promise<ParentLedger> {
    // Serialize first-time creation for this shop.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtext(${shopId}),
        hashtext('CASH_DRAWERS_PARENT')
      )
    `);

    const existingResult = await tx.execute<ParentLedger & { active: boolean }>(sql`
      SELECT id, code, name, active
      FROM ledger_accounts
      WHERE shop_id = ${shopId}
        AND system_key = 'CASH_DRAWERS'
        AND is_system = true
      LIMIT 1
      FOR UPDATE
    `);

    const existing = existingResult.rows[0];
    if (existing) {
        if (!existing.active) {
            throw new Error(
                'The Cash Drawers ledger parent is inactive. Ask an administrator to review the chart of accounts.',
            );
        }

        return { id: existing.id, code: existing.code, name: existing.name };
    }

    // Reserve a short, unused range for the parent and its first ten child
    // accounts. Codes 1050-1099 are preferred so the group sits near the
    // existing 1000-series cash account without colliding with the 1100-series
    // digital-wallet parent.
    const codeResult = await tx.execute<{ code: string }>(sql`
      SELECT candidates.code::text AS code
      FROM generate_series(1001, 1089) AS candidates(code)
      WHERE NOT EXISTS (
        SELECT 1
        FROM ledger_accounts existing
        WHERE existing.shop_id = ${shopId}
          AND CASE
            WHEN existing.code ~ '^[0-9]+$' THEN existing.code::integer
            ELSE NULL
          END BETWEEN candidates.code AND candidates.code + 10
      )
      ORDER BY ABS(candidates.code - 1050), candidates.code
      LIMIT 1
    `);

    const code = codeResult.rows[0]?.code;
    if (!code) {
        throw new Error(
            'No available ledger-code range exists for additional cash drawers. Review the chart of accounts before creating another drawer.',
        );
    }

    const createdResult = await tx.execute<ParentLedger>(sql`
      INSERT INTO ledger_accounts (
        shop_id,
        parent_id,
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
        NULL,
        ${code},
        'Additional Cash Drawers',
        'ASSET',
        'DEBIT',
        'CASH_DRAWERS',
        true,
        true
      )
      RETURNING id, code, name
    `);

    const created = createdResult.rows[0];
    if (!created) {
        throw new Error('Failed to create the Cash Drawers ledger parent.');
    }

    return created;
}

export async function listFinancialAccounts(): Promise<
    FinancialAccount[]
> {
    const context = await requirePermission(
        "financial_accounts.view",
    );

    const result = await db.execute<FinancialAccount>(sql`
    SELECT
      fa.id,
      fa.shop_id AS "shopId",
      fa.ledger_account_id AS "ledgerAccountId",
      fa.name,
      fa.kind,
      fa.provider,
      fa.identifier,
      fa.is_active AS "isActive",

      COALESCE(
        SUM(le.debit - le.credit),
        0
      )::text AS balance,

      la.active AS "ledgerAccountActive",
      la.is_system AS "ledgerAccountIsSystem"

    FROM financial_accounts fa

    INNER JOIN ledger_accounts la
      ON la.id = fa.ledger_account_id
      AND la.shop_id = fa.shop_id

    LEFT JOIN ledger_entries le
      ON le.ledger_account_id = la.id
      AND le.shop_id = fa.shop_id

    WHERE fa.shop_id = ${context.shopId}

    GROUP BY
      fa.id,
      fa.shop_id,
      fa.ledger_account_id,
      fa.name,
      fa.kind,
      fa.provider,
      fa.identifier,
      fa.is_active,
      la.active,
      la.is_system

    ORDER BY
      CASE fa.kind
        WHEN 'CASH' THEN 1
        WHEN 'DIGITAL_WALLET' THEN 2
        WHEN 'BANK' THEN 3
        ELSE 4
      END,
      fa.name ASC
  `);

    return result.rows;
}

export async function createFinancialAccount(
    input: CreateFinancialAccountInput,
) {
    const context = await requirePermission(
        "financial_accounts.create",
    );

    const normalized = normalizeCreateInput(input);

    if (
        normalized.name.toLowerCase() === "main cash drawer"
    ) {
        throw new Error(
            "Main Cash Drawer is reserved for the system cash account.",
        );
    }

    const result = await db.transaction(async (tx) => {
        const duplicateName = await tx.execute<{ id: string }>(sql`
      SELECT id
      FROM financial_accounts
      WHERE shop_id = ${context.shopId}
        AND lower(name) = lower(${normalized.name})
      LIMIT 1
    `);

        if (duplicateName.rows[0]) {
            throw new Error(
                "A financial account with this name already exists.",
            );
        }

        if (normalized.identifier) {
            const duplicateIdentifier =
                await tx.execute<{ id: string }>(sql`
          SELECT id
          FROM financial_accounts
          WHERE shop_id = ${context.shopId}
            AND lower(provider) = lower(${normalized.provider})
            AND lower(identifier) = lower(${normalized.identifier})
          LIMIT 1
        `);

            if (duplicateIdentifier.rows[0]) {
                throw new Error(
                    "A financial account with this provider and identifier already exists.",
                );
            }
        }

        let parent: ParentLedger | undefined;

        if (input.kind === "CASH") {
            parent = await getOrCreateCashDrawersParent(tx, context.shopId);
        } else {
            const parentSystemKey = PARENT_SYSTEM_KEYS[input.kind];

            const parentResult = await tx.execute<ParentLedger>(sql`
          SELECT
            id,
            code,
            name
          FROM ledger_accounts
          WHERE shop_id = ${context.shopId}
            AND system_key = ${parentSystemKey}
            AND is_system = true
            AND active = true
          LIMIT 1
          FOR UPDATE
        `);

            parent = parentResult.rows[0];
        }

        if (!parent) {
            throw new Error(
                `The ${input.kind} ledger parent account has not been configured.`,
            );
        }

        const ledgerCode = await getNextLedgerCode(
            tx,
            context.shopId,
            parent.id,
            parent.code,
        );

        const ledgerResult = await tx.execute<{ id: string }>(sql`
      INSERT INTO ledger_accounts (
        shop_id,
        parent_id,
        code,
        name,
        account_type,
        normal_balance,
        system_key,
        is_system,
        active
      )
      VALUES (
        ${context.shopId},
        ${parent.id},
        ${ledgerCode},
        ${normalized.name},
        'ASSET',
        'DEBIT',
        NULL,
        false,
        true
      )
      RETURNING id
    `);

        const ledgerAccount = ledgerResult.rows[0];

        if (!ledgerAccount) {
            throw new Error(
                "Failed to create the linked ledger account.",
            );
        }

        const financialResult =
            await tx.execute<{ id: string }>(sql`
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
          ${context.shopId},
          ${ledgerAccount.id},
          ${normalized.name},
          ${input.kind}::financial_account_kind,
          ${normalized.provider},
          ${normalized.identifier},
          true
        )
        RETURNING id
      `);

        const financialAccount = financialResult.rows[0];

        if (!financialAccount) {
            throw new Error(
                "Failed to create the financial account.",
            );
        }

        return financialAccount;
    });

    return result;
}

export async function updateFinancialAccount(
    input: UpdateFinancialAccountInput,
) {
    const context = await requirePermission(
        "financial_accounts.update",
    );

    await db.transaction(async (tx) => {
        const accountResult = await tx.execute<{
            id: string;
            ledgerAccountId: string;
            kind: FinancialAccountKind;
            isSystem: boolean;
        }>(sql`
      SELECT
        fa.id,
        fa.ledger_account_id AS "ledgerAccountId",
        fa.kind,
        la.is_system AS "isSystem"
      FROM financial_accounts fa
      INNER JOIN ledger_accounts la
        ON la.id = fa.ledger_account_id
        AND la.shop_id = fa.shop_id
      WHERE fa.id = ${input.financialAccountId}
        AND fa.shop_id = ${context.shopId}
      LIMIT 1
    `);

        const account = accountResult.rows[0];

        if (!account) {
            throw new Error("Financial account was not found.");
        }

        if (account.isSystem) {
            throw new Error(
                "System financial accounts cannot be edited here.",
            );
        }

        const normalized = normalizeUpdateInput(
            input,
            account.kind,
        );

        const duplicateName = await tx.execute<{ id: string }>(sql`
      SELECT id
      FROM financial_accounts
      WHERE shop_id = ${context.shopId}
        AND lower(name) = lower(${normalized.name})
        AND id <> ${account.id}
      LIMIT 1
    `);

        if (duplicateName.rows[0]) {
            throw new Error(
                "A financial account with this name already exists.",
            );
        }

        if (normalized.identifier) {
            const duplicateIdentifier =
                await tx.execute<{ id: string }>(sql`
          SELECT id
          FROM financial_accounts
          WHERE shop_id = ${context.shopId}
            AND lower(provider) = lower(${normalized.provider})
            AND lower(identifier) = lower(${normalized.identifier})
            AND id <> ${account.id}
          LIMIT 1
        `);

            if (duplicateIdentifier.rows[0]) {
                throw new Error(
                    "A financial account with this provider and identifier already exists.",
                );
            }
        }

        await tx.execute(sql`
      UPDATE financial_accounts
      SET
        name = ${normalized.name},
        provider = ${normalized.provider},
        identifier = ${normalized.identifier},
        updated_at = now()
      WHERE id = ${account.id}
        AND shop_id = ${context.shopId}
    `);

        await tx.execute(sql`
      UPDATE ledger_accounts
      SET
        name = ${normalized.name},
        updated_at = now()
      WHERE id = ${account.ledgerAccountId}
        AND shop_id = ${context.shopId}
        AND is_system = false
    `);
    });
}

export async function setFinancialAccountStatus(
    financialAccountId: string,
    isActive: boolean,
) {
    const context = await requirePermission(
        "financial_accounts.deactivate",
    );

    await db.transaction(async (tx) => {
        const result = await tx.execute<{
            id: string;
            ledgerAccountId: string;
            kind: FinancialAccountKind;
            balance: string;
            isSystem: boolean;
        }>(sql`
      SELECT
        fa.id,
        fa.ledger_account_id AS "ledgerAccountId",
        fa.kind,

        COALESCE(
          SUM(le.debit - le.credit),
          0
        )::text AS balance,

        la.is_system AS "isSystem"

      FROM financial_accounts fa

      INNER JOIN ledger_accounts la
        ON la.id = fa.ledger_account_id
        AND la.shop_id = fa.shop_id

      LEFT JOIN ledger_entries le
        ON le.ledger_account_id = la.id
        AND le.shop_id = fa.shop_id

      WHERE fa.id = ${financialAccountId}
        AND fa.shop_id = ${context.shopId}

      GROUP BY
        fa.id,
        fa.ledger_account_id,
        fa.kind,
        la.is_system

      LIMIT 1
    `);

        const account = result.rows[0];

        if (!account) {
            throw new Error(
                "Financial account was not found.",
            );
        }

        if (account.isSystem) {
            throw new Error(
                "System financial accounts cannot be deactivated.",
            );
        }

        if (!isActive && account.kind === "CASH") {
            const defaultAssignment = await tx.execute<{ purpose: string }>(sql`
          SELECT purpose
          FROM cash_drawer_defaults
          WHERE shop_id = ${context.shopId}
            AND financial_account_id = ${account.id}
          LIMIT 1
        `);

            if (defaultAssignment.rows[0]) {
                const purpose = defaultAssignment.rows[0].purpose.toLowerCase();
                throw new Error(
                    `This account is assigned as the ${purpose} default cash drawer. Change the drawer assignment before deactivating it.`,
                );
            }

            const openSession = await tx.execute<{ id: string }>(sql`
          SELECT id
          FROM cash_sessions
          WHERE shop_id = ${context.shopId}
            AND financial_account_id = ${account.id}
            AND status = 'OPEN'
          LIMIT 1
        `);

            if (openSession.rows[0]) {
                throw new Error(
                    "Close the cash session before deactivating this drawer.",
                );
            }
        }

        if (!isActive && Number(account.balance) !== 0) {
            throw new Error(
                "The account must have a zero balance before it can be deactivated.",
            );
        }

        await tx.execute(sql`
      UPDATE financial_accounts
      SET
        is_active = ${isActive},
        updated_at = now()
      WHERE id = ${account.id}
        AND shop_id = ${context.shopId}
    `);

        await tx.execute(sql`
      UPDATE ledger_accounts
      SET
        active = ${isActive},
        updated_at = now()
      WHERE id = ${account.ledgerAccountId}
        AND shop_id = ${context.shopId}
        AND is_system = false
    `);
    });
}