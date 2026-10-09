import "dotenv/config";

import Decimal from "decimal.js";
import { sql } from "drizzle-orm";

import { db, pool } from "./client";

import {
    createAccountTransferInTransaction,
} from "../lib/finance/account-transfer-core";

type TestResult = {
    name: string;
    passed: boolean;
    skipped?: boolean;
    message?: string;
};

const ROLLBACK_MARKER =
    "__ACCOUNT_TRANSFER_TEST_ROLLBACK__";

async function main() {
    const results: TestResult[] = [];

    const shopResult = await db.execute<{
        id: string;
    }>(sql`
    SELECT id
    FROM shops
    WHERE slug = 'hamid-mobiles'
      AND active = true
    LIMIT 1
  `);

    const shop = shopResult.rows[0];

    if (!shop) {
        throw new Error(
            'Shop "hamid-mobiles" was not found.',
        );
    }

    const ownerResult = await db.execute<{
        userId: string;
    }>(sql`
    SELECT sm.user_id AS "userId"
    FROM shop_memberships sm
    INNER JOIN roles r
      ON r.id = sm.role_id
      AND r.shop_id = sm.shop_id
    WHERE sm.shop_id = ${shop.id}
      AND sm.status = 'ACTIVE'
      AND r.name = 'Owner'
    LIMIT 1
  `);

    const owner = ownerResult.rows[0];

    if (!owner) {
        throw new Error(
            "An active Owner membership was not found.",
        );
    }

    const accountsResult = await db.execute<{
        id: string;
        name: string;
        ledgerAccountId: string;
        balance: string;
    }>(sql`
    SELECT
      fa.id,
      fa.name,
      fa.ledger_account_id AS "ledgerAccountId",
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
    WHERE fa.shop_id = ${shop.id}
      AND fa.is_active = true
      AND la.active = true
    GROUP BY
      fa.id,
      fa.name,
      fa.ledger_account_id
    ORDER BY fa.created_at ASC
  `);

    if (accountsResult.rows.length < 2) {
        throw new Error(
            "At least two active financial accounts are required for transfer testing.",
        );
    }

    const source =
        accountsResult.rows.find(
            (account) =>
                new Decimal(account.balance).gte(
                    "1.00",
                ),
        );

    const destination =
        accountsResult.rows.find(
            (account) =>
                account.id !== source?.id,
        );

    if (!source || !destination) {
        throw new Error(
            "Could not find an account with at least Rs. 1.00 and a different destination.",
        );
    }

    async function expectFailure(
        name: string,
        callback: () => Promise<void>,
    ) {
        try {
            await callback();

            results.push({
                name,
                passed: false,
                message:
                    "Operation unexpectedly succeeded.",
            });
        } catch (error) {
            results.push({
                name,
                passed: true,
                message:
                    error instanceof Error
                        ? error.message
                        : "Expected rejection occurred.",
            });
        }
    }

    console.log(
        `Testing account transfers for shop ${shop.id}...`,
    );

    await expectFailure(
        "Same-account transfer rejected",
        async () => {
            await createAccountTransferInTransaction(
                db,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    sourceAccountId: source.id,
                    destinationAccountId: source.id,
                    amount: "1.00",
                },
            );
        },
    );

    await expectFailure(
        "Zero transfer rejected",
        async () => {
            await createAccountTransferInTransaction(
                db,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    sourceAccountId: source.id,
                    destinationAccountId:
                        destination.id,
                    amount: "0.00",
                },
            );
        },
    );

    await expectFailure(
        "Negative transfer rejected",
        async () => {
            await createAccountTransferInTransaction(
                db,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    sourceAccountId: source.id,
                    destinationAccountId:
                        destination.id,
                    amount: "-1.00",
                },
            );
        },
    );

    await expectFailure(
        "Too many decimal places rejected",
        async () => {
            await createAccountTransferInTransaction(
                db,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    sourceAccountId: source.id,
                    destinationAccountId:
                        destination.id,
                    amount: "1.001",
                },
            );
        },
    );

    const insufficientAmount =
        new Decimal(source.balance).plus(
            "1.00",
        );

    await expectFailure(
        "Insufficient balance rejected",
        async () => {
            await createAccountTransferInTransaction(
                db,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    sourceAccountId: source.id,
                    destinationAccountId:
                        destination.id,
                    amount: insufficientAmount.toFixed(2),
                },
            );
        },
    );

    await db.transaction(async (tx) => {
        await tx.execute(sql`
      UPDATE financial_accounts
      SET
        is_active = false,
        updated_at = now()
      WHERE id = ${source.id}
        AND shop_id = ${shop.id}
    `);

        try {
            await createAccountTransferInTransaction(
                tx,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    sourceAccountId: source.id,
                    destinationAccountId:
                        destination.id,
                    amount: "1.00",
                },
            );

            results.push({
                name: "Inactive source rejected",
                passed: false,
                message:
                    "Operation unexpectedly succeeded.",
            });
        } catch (error) {
            results.push({
                name: "Inactive source rejected",
                passed: true,
                message:
                    error instanceof Error
                        ? error.message
                        : "Expected rejection occurred.",
            });
        }

        await tx.execute(sql`
      UPDATE financial_accounts
      SET
        is_active = true,
        updated_at = now()
      WHERE id = ${source.id}
        AND shop_id = ${shop.id}
    `);
    });


    await db.transaction(async (tx) => {
        await tx.execute(sql`
      UPDATE financial_accounts
      SET
        is_active = false,
        updated_at = now()
      WHERE id = ${destination.id}
        AND shop_id = ${shop.id}
    `);

        try {
            await createAccountTransferInTransaction(
                tx,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    sourceAccountId: source.id,
                    destinationAccountId:
                        destination.id,
                    amount: "1.00",
                },
            );

            results.push({
                name: "Inactive destination rejected",
                passed: false,
                message:
                    "Operation unexpectedly succeeded.",
            });
        } catch (error) {
            results.push({
                name: "Inactive destination rejected",
                passed: true,
                message:
                    error instanceof Error
                        ? error.message
                        : "Expected rejection occurred.",
            });
        }

        await tx.execute(sql`
      UPDATE financial_accounts
      SET
        is_active = true,
        updated_at = now()
      WHERE id = ${destination.id}
        AND shop_id = ${shop.id}
    `);
    });

    const otherShopAccountResult =
        await db.execute<{
            id: string;
            shopId: string;
        }>(sql`
      SELECT
        fa.id,
        fa.shop_id AS "shopId"
      FROM financial_accounts fa
      WHERE fa.shop_id <> ${shop.id}
        AND fa.is_active = true
      LIMIT 1
    `);

    const otherShopAccount =
        otherShopAccountResult.rows[0];

    if (!otherShopAccount) {
        results.push({
            name: "Cross-shop account rejected",
            passed: true,
            skipped: true,
            message:
                "Skipped because only one shop currently has financial accounts.",
        });
    } else {
        await expectFailure(
            "Cross-shop account rejected",
            async () => {
                await createAccountTransferInTransaction(
                    db,
                    {
                        shopId: shop.id,
                        userId: owner.userId,
                    },
                    {
                        sourceAccountId:
                            source.id,
                        destinationAccountId:
                            otherShopAccount.id,
                        amount: "1.00",
                    },
                );
            },
        );
    }

    let rollbackDocumentNo: string | null =
        null;

    try {
        await db.transaction(async (tx) => {
            const beforeSequence =
                await tx.execute<{
                    lastValue: number;
                }>(sql`
          SELECT
            last_value AS "lastValue"
          FROM document_sequences
          WHERE shop_id = ${shop.id}
            AND document_type =
              'ACCOUNT_TRANSFER'
            AND year =
              ${new Date().getFullYear()}
          LIMIT 1
        `);

            const beforeSequenceValue =
                Number(
                    beforeSequence.rows[0]?.lastValue ??
                    0,
                );

            const result =
                await createAccountTransferInTransaction(
                    tx,
                    {
                        shopId: shop.id,
                        userId: owner.userId,
                    },
                    {
                        sourceAccountId:
                            source.id,
                        destinationAccountId:
                            destination.id,
                        amount: "1.00",
                        reason:
                            ROLLBACK_MARKER,
                    },
                );

            rollbackDocumentNo =
                result.documentNo;

            if (
                !/^TRF-\d{4}-\d{6}$/.test(
                    result.documentNo,
                )
            ) {
                throw new Error(
                    `Unexpected document number format: ${result.documentNo}`,
                );
            }

            if (
                result.amount !== "1.00"
            ) {
                throw new Error(
                    "Unexpected transfer amount returned.",
                );
            }

            if (!result.ledgerTransactionId) {
                throw new Error(
                    "Transfer did not produce a ledger transaction.",
                );
            }

            const ledgerResult =
                await tx.execute<{
                    entryCount: string;
                    totalDebit: string;
                    totalCredit: string;
                }>(sql`
          SELECT
            COUNT(*)::text AS "entryCount",
            COALESCE(
              SUM(debit),
              0
            )::text AS "totalDebit",
            COALESCE(
              SUM(credit),
              0
            )::text AS "totalCredit"
          FROM ledger_entries
          WHERE shop_id = ${shop.id}
            AND ledger_transaction_id =
              ${result.ledgerTransactionId}
        `);

            const ledger =
                ledgerResult.rows[0];

            if (!ledger) {
                throw new Error(
                    "Ledger verification failed.",
                );
            }

            if (ledger.entryCount !== "2") {
                throw new Error(
                    `Expected 2 ledger entries, found ${ledger.entryCount}.`,
                );
            }

            if (
                ledger.totalDebit !==
                "1.00" ||
                ledger.totalCredit !==
                "1.00"
            ) {
                throw new Error(
                    `Expected balanced 1.00/1.00 ledger, got ${ledger.totalDebit}/${ledger.totalCredit}.`,
                );
            }

            const transferResult =
                await tx.execute<{
                    count: string;
                }>(sql`
          SELECT COUNT(*)::text AS count
          FROM account_transfers
          WHERE id = ${result.transferId}
            AND shop_id = ${shop.id}
        `);

            if (
                transferResult.rows[0]?.count !==
                "1"
            ) {
                throw new Error(
                    "Transfer record was not created correctly.",
                );
            }

            const afterSequence =
                await tx.execute<{
                    lastValue: number;
                }>(sql`
          SELECT
            last_value AS "lastValue"
          FROM document_sequences
          WHERE shop_id = ${shop.id}
            AND document_type =
              'ACCOUNT_TRANSFER'
            AND year =
              ${new Date().getFullYear()}
          LIMIT 1
        `);

            const afterSequenceValue =
                Number(
                    afterSequence.rows[0]?.lastValue ??
                    0,
                );

            if (
                afterSequenceValue !==
                beforeSequenceValue + 1
            ) {
                throw new Error(
                    "Document sequence did not increment exactly once inside the transaction.",
                );
            }

            throw new Error(
                ROLLBACK_MARKER,
            );
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === ROLLBACK_MARKER
        ) {
            results.push({
                name: "Valid transfer accepted",
                passed: true,
                message:
                    `Transfer ${rollbackDocumentNo ?? ""} was created and verified inside the transaction.`,
            });
        } else {
            results.push({
                name: "Valid transfer accepted",
                passed: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Unexpected error.",
            });
        }
    }

    const rollbackTransferCheck =
        await db.execute<{
            count: string;
        }>(sql`
      SELECT COUNT(*)::text AS count
      FROM account_transfers
      WHERE shop_id = ${shop.id}
        AND reason = ${ROLLBACK_MARKER}
    `);

    results.push({
        name: "Valid transfer rolled back",
        passed:
            rollbackTransferCheck.rows[0]?.count ===
            "0",
        message:
            rollbackTransferCheck.rows[0]?.count ===
                "0"
                ? "No test transfer remains."
                : `Found ${rollbackTransferCheck.rows[0]?.count ?? "unknown"} test transfer(s).`,
    });

    const rollbackLedgerCheck =
        await db.execute<{
            count: string;
        }>(sql`
      SELECT COUNT(*)::text AS count
      FROM ledger_transactions
      WHERE shop_id = ${shop.id}
        AND description LIKE 'Transfer %'
        AND reference_type =
          'ACCOUNT_TRANSFER'
        AND id NOT IN (
          SELECT DISTINCT
            ledger_transaction_id
          FROM ledger_entries
          WHERE shop_id = ${shop.id}
        )
    `);

    void rollbackLedgerCheck;

    console.log("\nRESULTS");
    console.table(results);

    const failures = results.filter(
        (result) => !result.passed,
    );

    if (failures.length > 0) {
        throw new Error(
            `${failures.length} account transfer integrity test(s) failed.`,
        );
    }

    console.log(
        "\nAll account transfer integrity tests passed.",
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });