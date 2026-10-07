import Decimal from "decimal.js";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";

export type LedgerPostingLine = {
    ledgerAccountId: string;
    debit?: string | number;
    credit?: string | number;
    description?: string | null;
    cashSessionId?: string | null;
};

export type PostLedgerTransactionInput = {
    referenceType: string;
    referenceId?: string | null;
    description: string;
    occurredAt?: Date;
    lines: LedgerPostingLine[];
};

export type PostedLedgerTransaction = {
    transactionId: string;
    shopId: string;
    totalDebit: string;
    totalCredit: string;
    entryCount: number;
};

type LedgerAccountRecord = {
    id: string;
    name: string;
    active: boolean;
    isSystem: boolean;
    parentId: string | null;
};

type PostingContext = {
    shopId: string;
    userId: string;
};

type DbExecutor = Pick<typeof db, "execute">;

function normalizeAmount(
    value: string | number | undefined,
    fieldName: string,
) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return new Decimal(0);
    }

    let amount: Decimal;

    try {
        amount = new Decimal(value);
    } catch {
        throw new Error(
            `${fieldName} must be a valid numeric amount.`,
        );
    }

    if (!amount.isFinite()) {
        throw new Error(
            `${fieldName} must be a finite numeric amount.`,
        );
    }

    if (amount.isNegative()) {
        throw new Error(
            `${fieldName} cannot be negative.`,
        );
    }

    if (amount.decimalPlaces() > 2) {
        throw new Error(
            `${fieldName} cannot have more than 2 decimal places.`,
        );
    }

    return amount;
}

function normalizeReferenceType(value: string) {
    const referenceType = value.trim();

    if (!referenceType) {
        throw new Error("Reference type is required.");
    }

    if (referenceType.length > 50) {
        throw new Error(
            "Reference type must not exceed 50 characters.",
        );
    }

    return referenceType;
}

function normalizeDescription(value: string) {
    const description = value.trim();

    if (!description) {
        throw new Error(
            "Transaction description is required.",
        );
    }

    if (description.length > 500) {
        throw new Error(
            "Transaction description must not exceed 500 characters.",
        );
    }

    return description;
}

function normalizeLineDescription(
    value: string | null | undefined,
) {
    if (value === undefined || value === null) {
        return null;
    }

    const description = value.trim();

    if (!description) {
        return null;
    }

    if (description.length > 500) {
        throw new Error(
            "Ledger line description must not exceed 500 characters.",
        );
    }

    return description;
}

function validateLedgerAccountIds(
    lines: LedgerPostingLine[],
) {
    for (const [index, line] of lines.entries()) {
        if (!line.ledgerAccountId?.trim()) {
            throw new Error(
                `Ledger account is required for line ${index + 1}.`,
            );
        }
    }
}

function normalizeInput(
    input: PostLedgerTransactionInput,
) {
    const referenceType = normalizeReferenceType(
        input.referenceType,
    );

    const description = normalizeDescription(
        input.description,
    );

    if (!input.lines || input.lines.length < 2) {
        throw new Error(
            "A ledger transaction requires at least two entries.",
        );
    }

    validateLedgerAccountIds(input.lines);

    const occurredAt =
        input.occurredAt ?? new Date();

    if (Number.isNaN(occurredAt.getTime())) {
        throw new Error(
            "Occurred-at date is invalid.",
        );
    }

    const lines = input.lines.map(
        (line, index) => {
            const debit = normalizeAmount(
                line.debit,
                `Debit on line ${index + 1}`,
            );

            const credit = normalizeAmount(
                line.credit,
                `Credit on line ${index + 1}`,
            );

            const hasDebit = debit.gt(0);
            const hasCredit = credit.gt(0);

            if (hasDebit === hasCredit) {
                throw new Error(
                    `Line ${index + 1} must contain either a debit or a credit amount, but not both.`,
                );
            }

            return {
                ledgerAccountId:
                    line.ledgerAccountId.trim(),
                debit,
                credit,
                description:
                    normalizeLineDescription(
                        line.description,
                    ),
                cashSessionId:
                    line.cashSessionId?.trim() || null,
            };
        },
    );

    const totalDebit = lines.reduce(
        (total, line) =>
            total.plus(line.debit),
        new Decimal(0),
    );

    const totalCredit = lines.reduce(
        (total, line) =>
            total.plus(line.credit),
        new Decimal(0),
    );

    if (totalDebit.isZero()) {
        throw new Error(
            "A ledger transaction amount must be greater than zero.",
        );
    }

    if (!totalDebit.equals(totalCredit)) {
        throw new Error(
            `Ledger transaction is unbalanced. Debit = ${totalDebit.toFixed(
                2,
            )}, Credit = ${totalCredit.toFixed(2)}.`,
        );
    }

    return {
        referenceType,
        description,
        occurredAt,
        lines,
        totalDebit,
        totalCredit,
    };
}

export async function postLedgerTransactionInTransaction(
    tx: DbExecutor,
    context: PostingContext,
    input: PostLedgerTransactionInput,
): Promise<PostedLedgerTransaction> {
    const normalized = normalizeInput(input);

    const uniqueAccountIds = [
        ...new Set(
            normalized.lines.map(
                (line) => line.ledgerAccountId,
            ),
        ),
    ];

    const accounts = new Map<
        string,
        LedgerAccountRecord
    >();

    for (const accountId of uniqueAccountIds) {
        const accountResult =
            await tx.execute<LedgerAccountRecord>(sql`
        SELECT
          id,
          name,
          active,
          is_system AS "isSystem",
          parent_id AS "parentId"
        FROM ledger_accounts
        WHERE id = ${accountId}
          AND shop_id = ${context.shopId}
        LIMIT 1
        FOR UPDATE
      `);

        const account = accountResult.rows[0];

        if (!account) {
            throw new Error(
                "One or more ledger accounts do not belong to the current shop.",
            );
        }

        if (!account.active) {
            throw new Error(
                `Ledger account "${account.name}" is inactive.`,
            );
        }

        const childResult =
            await tx.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1
          FROM ledger_accounts
          WHERE shop_id = ${context.shopId}
            AND parent_id = ${account.id}
        ) AS exists
      `);

        if (Boolean(childResult.rows[0]?.exists)) {
            throw new Error(
                `Ledger account "${account.name}" is a parent account and cannot receive direct postings.`,
            );
        }

        accounts.set(account.id, account);
    }

    const transactionResult =
        await tx.execute<{ id: string }>(sql`
      INSERT INTO ledger_transactions (
        shop_id,
        reference_type,
        reference_id,
        description,
        occurred_at,
        created_by
      )
      VALUES (
        ${context.shopId},
        ${normalized.referenceType},
        ${input.referenceId ?? null},
        ${normalized.description},
        ${normalized.occurredAt},
        ${context.userId}
      )
      RETURNING id
    `);

    const ledgerTransaction =
        transactionResult.rows[0];

    if (!ledgerTransaction) {
        throw new Error(
            "Failed to create the ledger transaction.",
        );
    }

    for (const line of normalized.lines) {
        const account = accounts.get(
            line.ledgerAccountId,
        );

        if (!account) {
            throw new Error(
                "A validated ledger account could not be resolved.",
            );
        }

        await tx.execute(sql`
      INSERT INTO ledger_entries (
        shop_id,
        ledger_transaction_id,
        ledger_account_id,
        cash_session_id,
        debit,
        credit,
        description
      )
      VALUES (
        ${context.shopId},
        ${ledgerTransaction.id},
        ${line.ledgerAccountId},
        ${line.cashSessionId},
        ${line.debit.toFixed(2)}::numeric,
        ${line.credit.toFixed(2)}::numeric,
        ${line.description}
      )
    `);
    }

    return {
        transactionId: ledgerTransaction.id,
        shopId: context.shopId,
        totalDebit: normalized.totalDebit.toFixed(2),
        totalCredit: normalized.totalCredit.toFixed(2),
        entryCount: normalized.lines.length,
    };
}