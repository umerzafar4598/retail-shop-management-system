import Decimal from "decimal.js";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { nextDocumentNumber } from "./document-number";
import {
    postLedgerTransactionInTransaction,
} from "./ledger-core";

export type CreateAccountTransferInput = {
    sourceAccountId: string;
    destinationAccountId: string;
    amount: string | number;
    reason?: string;
};

type PostingContext = {
    shopId: string;
    userId: string;
};

type DbExecutor = Pick<typeof db, "execute">;

function normalizeAmount(value: string | number) {
    let amount: Decimal;

    try {
        amount = new Decimal(value);
    } catch {
        throw new Error(
            "Transfer amount must be a valid numeric amount.",
        );
    }

    if (!amount.isFinite()) {
        throw new Error(
            "Transfer amount must be a finite numeric amount.",
        );
    }

    if (amount.isNegative()) {
        throw new Error(
            "Transfer amount cannot be negative.",
        );
    }

    if (amount.decimalPlaces() > 2) {
        throw new Error(
            "Transfer amount cannot have more than 2 decimal places.",
        );
    }

    if (amount.isZero()) {
        throw new Error(
            "Transfer amount must be greater than zero.",
        );
    }

    return amount;
}

function normalizeReason(value?: string) {
    const reason = value?.trim() || null;

    if (reason && reason.length > 500) {
        throw new Error(
            "Transfer reason must not exceed 500 characters.",
        );
    }

    return reason;
}

function validateAccountIds(
    input: CreateAccountTransferInput,
) {
    const sourceAccountId =
        input.sourceAccountId?.trim();

    const destinationAccountId =
        input.destinationAccountId?.trim();

    if (!sourceAccountId) {
        throw new Error("Source account is required.");
    }

    if (!destinationAccountId) {
        throw new Error(
            "Destination account is required.",
        );
    }

    if (
        sourceAccountId === destinationAccountId
    ) {
        throw new Error(
            "Source and destination accounts must be different.",
        );
    }

    return {
        sourceAccountId,
        destinationAccountId,
    };
}

function getCurrentYear() {
    return new Date().getFullYear();
}

export async function createAccountTransferInTransaction(
    tx: DbExecutor,
    context: PostingContext,
    input: CreateAccountTransferInput,
) {
    const {
        sourceAccountId,
        destinationAccountId,
    } = validateAccountIds(input);

    const amount = normalizeAmount(input.amount);
    const reason = normalizeReason(input.reason);

    /**
     * Lock both account rows and their linked ledger
     * accounts in deterministic ID order.
     *
     * This prevents concurrent transfers from using
     * a stale source balance.
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
        isActive: boolean;
        ledgerActive: boolean;
    }>(sql`
    SELECT
      fa.id,
      fa.ledger_account_id AS "ledgerAccountId",
      fa.name,
      fa.kind,
      fa.is_active AS "isActive",
      la.active AS "ledgerActive"
    FROM financial_accounts fa
    INNER JOIN ledger_accounts la
      ON la.id = fa.ledger_account_id
      AND la.shop_id = fa.shop_id
    WHERE fa.shop_id = ${context.shopId}
      AND fa.id IN (
        ${sourceAccountId},
        ${destinationAccountId}
      )
    ORDER BY fa.id
    FOR UPDATE OF fa, la
  `);

    if (accountResult.rows.length !== 2) {
        throw new Error(
            "Source or destination financial account was not found.",
        );
    }

    const source = accountResult.rows.find(
        (account) =>
            account.id === sourceAccountId,
    );

    const destination = accountResult.rows.find(
        (account) =>
            account.id === destinationAccountId,
    );

    if (!source || !destination) {
        throw new Error(
            "Source or destination financial account was not found.",
        );
    }

    if (
        !source.isActive ||
        !source.ledgerActive
    ) {
        throw new Error(
            `Source account "${source.name}" is inactive.`,
        );
    }

    if (
        !destination.isActive ||
        !destination.ledgerActive
    ) {
        throw new Error(
            `Destination account "${destination.name}" is inactive.`,
        );
    }

    const balanceResult =
        await tx.execute<{
            balance: string;
        }>(sql`
      SELECT
        COALESCE(
          SUM(debit - credit),
          0
        )::text AS balance
      FROM ledger_entries
      WHERE shop_id = ${context.shopId}
        AND ledger_account_id =
          ${source.ledgerAccountId}
    `);

    const sourceBalance = new Decimal(
        balanceResult.rows[0]?.balance ?? "0",
    );

    if (sourceBalance.lt(amount)) {
        throw new Error(
            `Insufficient balance in "${source.name}". Available = Rs. ${sourceBalance.toFixed(
                2,
            )}, requested = Rs. ${amount.toFixed(2)}.`,
        );
    }

    const documentNo =
        await nextDocumentNumber(
            tx,
            context.shopId,
            "ACCOUNT_TRANSFER",
            "TRF",
            getCurrentYear(),
        );

    const transferResult =
        await tx.execute<{ id: string }>(sql`
      INSERT INTO account_transfers (
        shop_id,
        document_no,
        source_account_id,
        destination_account_id,
        amount,
        reason,
        created_by
      )
      VALUES (
        ${context.shopId},
        ${documentNo},
        ${sourceAccountId},
        ${destinationAccountId},
        ${amount.toFixed(2)}::numeric,
        ${reason},
        ${context.userId}
      )
      RETURNING id
    `);

    const transfer =
        transferResult.rows[0];

    if (!transfer) {
        throw new Error(
            "Failed to create the account transfer.",
        );
    }

    const ledgerTransaction =
        await postLedgerTransactionInTransaction(
            tx,
            {
                shopId: context.shopId,
                userId: context.userId,
            },
            {
                referenceType: "ACCOUNT_TRANSFER",
                referenceId: transfer.id,
                description:
                    `Transfer ${documentNo}: ${source.name} → ${destination.name}`,
                lines: [
                    {
                        ledgerAccountId:
                            source.ledgerAccountId,
                        credit: amount.toFixed(2),
                        description:
                            `Transfer out to ${destination.name}`,
                    },
                    {
                        ledgerAccountId:
                            destination.ledgerAccountId,
                        debit: amount.toFixed(2),
                        description:
                            `Transfer in from ${source.name}`,
                    },
                ],
            },
        );

    return {
        transferId: transfer.id,
        documentNo,
        ledgerTransactionId:
            ledgerTransaction.transactionId,
        sourceAccountId,
        destinationAccountId,
        amount: amount.toFixed(2),
    };
}