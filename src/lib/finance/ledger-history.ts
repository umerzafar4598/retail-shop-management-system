import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/authorization";

export type LedgerAccountBalance = {
    id: string;
    code: string;
    name: string;
    parentId: string | null;
    accountType:
    | "ASSET"
    | "LIABILITY"
    | "EQUITY"
    | "REVENUE"
    | "EXPENSE";
    normalBalance: "DEBIT" | "CREDIT";
    isSystem: boolean;
    active: boolean;
    balance: string;
};

export type LedgerEntryView = {
    id: string;
    ledgerAccountId: string;
    ledgerAccountCode: string;
    ledgerAccountName: string;
    debit: string;
    credit: string;
    description: string | null;
};

export type LedgerTransactionView = {
    id: string;
    referenceType: string;
    referenceId: string | null;
    description: string;
    occurredAt: Date;
    createdAt: Date;
    createdBy: string;
    createdByName: string;
    entries: LedgerEntryView[];
    totalDebit: string;
    totalCredit: string;
};

export async function listLedgerAccountsWithBalances(): Promise<
    LedgerAccountBalance[]
> {
    const context = await requirePermission("ledger.view");

    const result =
        await db.execute<LedgerAccountBalance>(sql`
      SELECT
        la.id,
        la.code,
        la.name,
        la.parent_id AS "parentId",
        la.account_type AS "accountType",
        la.normal_balance AS "normalBalance",
        la.is_system AS "isSystem",
        la.active,

        CASE
          WHEN la.normal_balance = 'DEBIT'
            THEN COALESCE(
              SUM(le.debit - le.credit),
              0
            )

          ELSE COALESCE(
            SUM(le.credit - le.debit),
            0
          )
        END::text AS balance

      FROM ledger_accounts la

      LEFT JOIN ledger_entries le
        ON le.ledger_account_id = la.id
        AND le.shop_id = la.shop_id

      WHERE la.shop_id = ${context.shopId}

      GROUP BY
        la.id,
        la.code,
        la.name,
        la.parent_id,
        la.account_type,
        la.normal_balance,
        la.is_system,
        la.active

      ORDER BY
        la.code ASC
    `);

    return result.rows;
}

export async function listLedgerTransactions(
    limit = 100,
): Promise<LedgerTransactionView[]> {
    const context = await requirePermission("ledger.view");

    const safeLimit = Math.min(
        Math.max(Math.trunc(limit), 1),
        200,
    );

    const result =
        await db.execute<{
            id: string;
            referenceType: string;
            referenceId: string | null;
            description: string;
            occurredAt: Date;
            createdAt: Date;
            createdBy: string;
            createdByName: string;
        }>(sql`
      SELECT
        lt.id,
        lt.reference_type AS "referenceType",
        lt.reference_id AS "referenceId",
        lt.description,
        lt.occurred_at AS "occurredAt",
        lt.created_at AS "createdAt",
        lt.created_by AS "createdBy",
        COALESCE(u.name, lt.created_by) AS "createdByName"

      FROM ledger_transactions lt

      LEFT JOIN "user" u
        ON u.id = lt.created_by

      WHERE lt.shop_id = ${context.shopId}

      ORDER BY
        lt.occurred_at DESC,
        lt.created_at DESC

      LIMIT ${safeLimit}
    `);

    if (result.rows.length === 0) {
        return [];
    }

    const transactionIds =
        result.rows.map(
            (transaction) => transaction.id,
        );

    const entriesResult =
        await db.execute<{
            id: string;
            ledgerTransactionId: string;
            ledgerAccountId: string;
            ledgerAccountCode: string;
            ledgerAccountName: string;
            debit: string;
            credit: string;
            description: string | null;
        }>(sql`
      SELECT
        le.id,
        le.ledger_transaction_id AS "ledgerTransactionId",
        le.ledger_account_id AS "ledgerAccountId",
        la.code AS "ledgerAccountCode",
        la.name AS "ledgerAccountName",
        le.debit::text AS debit,
        le.credit::text AS credit,
        le.description

      FROM ledger_entries le

      INNER JOIN ledger_accounts la
        ON la.id = le.ledger_account_id
        AND la.shop_id = le.shop_id

      WHERE le.shop_id = ${context.shopId}
        AND le.ledger_transaction_id IN (
          ${sql.join(
            transactionIds.map(
                (id) => sql`${id}`,
            ),
            sql`, `,
        )}
        )

      ORDER BY
        le.created_at ASC,
        le.id ASC
    `);

    const entriesByTransaction =
        new Map<string, LedgerEntryView[]>();

    for (const entry of entriesResult.rows) {
        const existing =
            entriesByTransaction.get(
                entry.ledgerTransactionId,
            ) ?? [];

        existing.push({
            id: entry.id,
            ledgerAccountId:
                entry.ledgerAccountId,
            ledgerAccountCode:
                entry.ledgerAccountCode,
            ledgerAccountName:
                entry.ledgerAccountName,
            debit: entry.debit,
            credit: entry.credit,
            description:
                entry.description,
        });

        entriesByTransaction.set(
            entry.ledgerTransactionId,
            existing,
        );
    }

    return result.rows.map((transaction) => {
        const entries =
            entriesByTransaction.get(
                transaction.id,
            ) ?? [];

        const totalDebit =
            entries.reduce(
                (total, entry) =>
                    total + Number(entry.debit),
                0,
            );

        const totalCredit =
            entries.reduce(
                (total, entry) =>
                    total + Number(entry.credit),
                0,
            );

        return {
            id: transaction.id,
            referenceType:
                transaction.referenceType,
            referenceId:
                transaction.referenceId,
            description:
                transaction.description,
            occurredAt:
                transaction.occurredAt,
            createdAt:
                transaction.createdAt,
            createdBy:
                transaction.createdBy,
            createdByName:
                transaction.createdByName,
            entries,
            totalDebit:
                totalDebit.toFixed(2),
            totalCredit:
                totalCredit.toFixed(2),
        };
    });
}