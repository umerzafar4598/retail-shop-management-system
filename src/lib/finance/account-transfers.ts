import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
    requirePermission,
} from "@/lib/authorization";
import {
    getCurrentSession,
} from "@/lib/session";

import {
    createAccountTransferInTransaction,
    type CreateAccountTransferInput,
} from "./account-transfer-core";

export type {
    CreateAccountTransferInput,
};

export type TransferAccount = {
    id: string;
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
};

export type AccountTransfer = {
    id: string;
    documentNo: string;
    sourceAccountId: string;
    sourceAccountName: string;
    destinationAccountId: string;
    destinationAccountName: string;
    amount: string;
    reason: string | null;
    createdBy: string;
    completedAt: Date;
};

export async function listTransferAccounts(): Promise<
    TransferAccount[]
> {
    const context = await requirePermission(
        "account_transfers.view",
    );

    const result =
        await db.execute<TransferAccount>(sql`
      SELECT
        fa.id,
        fa.name,
        fa.kind,
        fa.provider,
        fa.identifier,
        fa.is_active AS "isActive",

        COALESCE(
          SUM(le.debit - le.credit),
          0
        )::text AS balance

      FROM financial_accounts fa

      INNER JOIN ledger_accounts la
        ON la.id = fa.ledger_account_id
        AND la.shop_id = fa.shop_id

      LEFT JOIN ledger_entries le
        ON le.ledger_account_id = la.id
        AND le.shop_id = fa.shop_id

      WHERE fa.shop_id = ${context.shopId}
        AND fa.is_active = true
        AND la.active = true

      GROUP BY
        fa.id,
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

export async function listAccountTransfers(): Promise<
    AccountTransfer[]
> {
    const context = await requirePermission(
        "account_transfers.view",
    );

    const result =
        await db.execute<AccountTransfer>(sql`
      SELECT
        at.id,
        at.document_no AS "documentNo",

        at.source_account_id AS "sourceAccountId",
        source.name AS "sourceAccountName",

        at.destination_account_id AS "destinationAccountId",
        destination.name AS "destinationAccountName",

        at.amount::text AS amount,
        at.reason,
        at.created_by AS "createdBy",
        at.completed_at AS "completedAt"

      FROM account_transfers at

      INNER JOIN financial_accounts source
        ON source.id = at.source_account_id
        AND source.shop_id = at.shop_id

      INNER JOIN financial_accounts destination
        ON destination.id = at.destination_account_id
        AND destination.shop_id = at.shop_id

      WHERE at.shop_id = ${context.shopId}

      ORDER BY
        at.completed_at DESC
      LIMIT 100
    `);

    return result.rows;
}

export async function createAccountTransfer(
    input: CreateAccountTransferInput,
) {
    const context = await requirePermission(
        "account_transfers.create",
    );

    const session = await getCurrentSession();

    if (!session) {
        throw new Error(
            "You must be authenticated.",
        );
    }

    return db.transaction(async (tx) => {
        return createAccountTransferInTransaction(
            tx,
            {
                shopId: context.shopId,
                userId: session.user.id,
            },
            input,
        );
    });
}