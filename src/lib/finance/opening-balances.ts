import "server-only";

import Decimal from "decimal.js";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/authorization";
import { getCurrentSession } from "@/lib/session";

import {
    postLedgerTransactionInTransaction,
    type PostedLedgerTransaction,
} from "./ledger-core";

export type OpeningBalanceAccount = {
    id: string;
    ledgerAccountId: string;
    name: string;
    kind:
    | "CASH"
    | "DIGITAL_WALLET"
    | "BANK"
    | "OTHER";
    provider: string;
    identifier: string | null;
    isActive: boolean;
    balance: string;
    hasLedgerHistory: boolean;
    openingBalanceSet: boolean;
};

function normalizeOpeningBalance(
    value: string | number,
) {
    let amount: Decimal;

    try {
        amount = new Decimal(value);
    } catch {
        throw new Error(
            "Opening balance must be a valid numeric amount.",
        );
    }

    if (!amount.isFinite()) {
        throw new Error(
            "Opening balance must be a finite numeric amount.",
        );
    }

    if (amount.isNegative()) {
        throw new Error(
            "Opening balance cannot be negative.",
        );
    }

    if (amount.decimalPlaces() > 2) {
        throw new Error(
            "Opening balance cannot have more than 2 decimal places.",
        );
    }

    if (amount.isZero()) {
        throw new Error(
            "Opening balance must be greater than zero.",
        );
    }

    return amount;
}

export async function listOpeningBalanceAccounts(): Promise<
    OpeningBalanceAccount[]
> {
    const context = await requirePermission(
        "financial_accounts.opening_balance",
    );

    const result =
        await db.execute<OpeningBalanceAccount>(sql`
      SELECT
        fa.id,
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

        EXISTS (
          SELECT 1
          FROM ledger_entries history
          WHERE history.shop_id = fa.shop_id
            AND history.ledger_account_id =
              fa.ledger_account_id
        ) AS "hasLedgerHistory",

        EXISTS (
          SELECT 1
          FROM ledger_transactions opening
          WHERE opening.shop_id = fa.shop_id
            AND opening.reference_type = 'OPENING_BALANCE'
            AND opening.reference_id = fa.id
        ) AS "openingBalanceSet"

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
        fa.is_active

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

export async function setOpeningBalance(
    financialAccountId: string,
    rawAmount: string | number,
): Promise<PostedLedgerTransaction> {
    const context = await requirePermission(
        "financial_accounts.opening_balance",
    );
    const session = await getCurrentSession();

    if (!session) {
        throw new Error("You must be authenticated.");
    }
    const amount =
        normalizeOpeningBalance(rawAmount);

    return db.transaction(async (tx) => {
        /**
         * Lock the financial account row.
         *
         * This prevents two simultaneous opening-balance
         * requests from both passing the "no history" check.
         */
        const accountResult = await tx.execute<{
            id: string;
            ledgerAccountId: string;
            name: string;
            kind:
            | "CASH"
            | "DIGITAL_WALLET"
            | "BANK"
            | "OTHER";
            provider: string;
            isActive: boolean;
        }>(sql`
      SELECT
        fa.id,
        fa.ledger_account_id AS "ledgerAccountId",
        fa.name,
        fa.kind,
        fa.provider,
        fa.is_active AS "isActive"
      FROM financial_accounts fa
      WHERE fa.id = ${financialAccountId}
        AND fa.shop_id = ${context.shopId}
      LIMIT 1
      FOR UPDATE
    `);

        const account = accountResult.rows[0];

        if (!account) {
            throw new Error(
                "Financial account was not found.",
            );
        }

        if (!account.isActive) {
            throw new Error(
                "An inactive financial account cannot receive an opening balance.",
            );
        }

        /**
         * Opening balances are permitted on the system
         * Main Cash Drawer. This is intentionally different
         * from the edit/deactivate rules for system accounts.
         */
        const historyResult =
            await tx.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1
          FROM ledger_entries
          WHERE shop_id = ${context.shopId}
            AND ledger_account_id =
              ${account.ledgerAccountId}
        ) AS exists
      `);

        if (Boolean(historyResult.rows[0]?.exists)) {
            throw new Error(
                `Opening balance cannot be set because "${account.name}" already has ledger history.`,
            );
        }

        const openingResult =
            await tx.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1
          FROM ledger_transactions
          WHERE shop_id = ${context.shopId}
            AND reference_type = 'OPENING_BALANCE'
            AND reference_id = ${account.id}
        ) AS exists
      `);

        if (Boolean(openingResult.rows[0]?.exists)) {
            throw new Error(
                `An opening balance has already been recorded for "${account.name}".`,
            );
        }

        const equityResult =
            await tx.execute<{ id: string }>(sql`
        SELECT id
        FROM ledger_accounts
        WHERE shop_id = ${context.shopId}
          AND system_key = 'OPENING_BALANCE_EQUITY'
          AND is_system = true
          AND active = true
        LIMIT 1
        FOR UPDATE
      `);

        const openingEquity =
            equityResult.rows[0];

        if (!openingEquity) {
            throw new Error(
                "Opening Balance Equity account is not configured.",
            );
        }

        const posted =
            await postLedgerTransactionInTransaction(
                tx,
                {
                    shopId: context.shopId,
                    userId: session.user.id,
                },
                {
                    referenceType: "OPENING_BALANCE",
                    referenceId: account.id,
                    description: `Opening balance for ${account.name}`,
                    lines: [
                        {
                            ledgerAccountId:
                                account.ledgerAccountId,
                            debit: amount.toFixed(2),
                            description:
                                `Opening balance: ${account.name}`,
                        },
                        {
                            ledgerAccountId:
                                openingEquity.id,
                            credit: amount.toFixed(2),
                            description:
                                "Opening balance equity",
                        },
                    ],
                },
            );

        return posted;
    });
}