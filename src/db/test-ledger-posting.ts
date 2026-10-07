import "dotenv/config";

import { sql } from "drizzle-orm";

import { db, pool } from "./client";
import {
    postLedgerTransactionInTransaction,
} from "../lib/finance/ledger-core";

const ROLLBACK_MARKER =
    "__LEDGER_INTEGRITY_TEST_ROLLBACK__";

type TestResult = {
    name: string;
    passed: boolean;
    skipped?: boolean;
    message?: string;
};

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

    const cashResult = await db.execute<{
        id: string;
    }>(sql`
    SELECT id
    FROM ledger_accounts
    WHERE shop_id = ${shop.id}
      AND system_key = 'CASH_DRAWER'
      AND active = true
    LIMIT 1
  `);

    const cash = cashResult.rows[0];

    if (!cash) {
        throw new Error(
            "Cash Drawer ledger account was not found.",
        );
    }

    const walletResult = await db.execute<{
        id: string;
    }>(sql`
    SELECT la.id
    FROM ledger_accounts la
    WHERE la.shop_id = ${shop.id}
      AND la.parent_id = (
        SELECT id
        FROM ledger_accounts
        WHERE shop_id = ${shop.id}
          AND system_key = 'DIGITAL_WALLETS'
        LIMIT 1
      )
      AND la.active = true
      AND la.is_system = false
    ORDER BY la.created_at ASC
    LIMIT 1
  `);

    const wallet = walletResult.rows[0];

    if (!wallet) {
        throw new Error(
            "No active digital-wallet ledger account was found.",
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
        `Testing ledger posting for shop ${shop.id}...`,
    );

    await expectFailure(
        "One-entry transaction rejected",
        async () => {
            await postLedgerTransactionInTransaction(
                db,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    referenceType: "TEST",
                    description: "Should fail",
                    lines: [
                        {
                            ledgerAccountId: cash.id,
                            debit: "100.00",
                        },
                    ],
                },
            );
        },
    );

    await expectFailure(
        "Unbalanced transaction rejected",
        async () => {
            await postLedgerTransactionInTransaction(
                db,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    referenceType: "TEST",
                    description: "Should fail",
                    lines: [
                        {
                            ledgerAccountId: cash.id,
                            debit: "100.00",
                        },
                        {
                            ledgerAccountId: wallet.id,
                            credit: "90.00",
                        },
                    ],
                },
            );
        },
    );

    await expectFailure(
        "Debit and credit on same line rejected",
        async () => {
            await postLedgerTransactionInTransaction(
                db,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    referenceType: "TEST",
                    description: "Should fail",
                    lines: [
                        {
                            ledgerAccountId: cash.id,
                            debit: "100.00",
                            credit: "100.00",
                        },
                        {
                            ledgerAccountId: wallet.id,
                            credit: "100.00",
                        },
                    ],
                },
            );
        },
    );

    await expectFailure(
        "Zero-value transaction rejected",
        async () => {
            await postLedgerTransactionInTransaction(
                db,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    referenceType: "TEST",
                    description: "Should fail",
                    lines: [
                        {
                            ledgerAccountId: cash.id,
                            debit: "0.00",
                        },
                        {
                            ledgerAccountId: wallet.id,
                            credit: "0.00",
                        },
                    ],
                },
            );
        },
    );

    const parentResult = await db.execute<{
        id: string;
    }>(sql`
    SELECT id
    FROM ledger_accounts
    WHERE shop_id = ${shop.id}
      AND system_key = 'DIGITAL_WALLETS'
      AND active = true
    LIMIT 1
  `);

    const parent = parentResult.rows[0];

    if (!parent) {
        throw new Error(
            "Digital Wallets parent ledger account was not found.",
        );
    }

    await expectFailure(
        "Parent ledger account rejected",
        async () => {
            await postLedgerTransactionInTransaction(
                db,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    referenceType: "TEST",
                    description: "Should fail",
                    lines: [
                        {
                            ledgerAccountId: parent.id,
                            debit: "100.00",
                        },
                        {
                            ledgerAccountId: cash.id,
                            credit: "100.00",
                        },
                    ],
                },
            );
        },
    );

    const otherShopResult = await db.execute<{
        id: string;
        shopId: string;
    }>(sql`
    SELECT
      la.id,
      la.shop_id AS "shopId"
    FROM ledger_accounts la
    WHERE la.shop_id <> ${shop.id}
      AND la.active = true
    LIMIT 1
  `);

    const otherShopAccount =
        otherShopResult.rows[0];

    if (!otherShopAccount) {
        results.push({
            name: "Cross-shop account rejected",
            passed: true,
            skipped: true,
            message:
                "Skipped because there is currently only one shop with ledger accounts.",
        });
    } else {
        await expectFailure(
            "Cross-shop account rejected",
            async () => {
                await postLedgerTransactionInTransaction(
                    db,
                    {
                        shopId: shop.id,
                        userId: owner.userId,
                    },
                    {
                        referenceType: "TEST",
                        description: "Should fail",
                        lines: [
                            {
                                ledgerAccountId: cash.id,
                                debit: "100.00",
                            },
                            {
                                ledgerAccountId:
                                    otherShopAccount.id,
                                credit: "100.00",
                            },
                        ],
                    },
                );
            },
        );
    }

    await db.transaction(async (tx) => {
        await tx.execute(sql`
      UPDATE ledger_accounts
      SET active = false,
          updated_at = now()
      WHERE id = ${wallet.id}
        AND shop_id = ${shop.id}
    `);

        try {
            await postLedgerTransactionInTransaction(
                tx,
                {
                    shopId: shop.id,
                    userId: owner.userId,
                },
                {
                    referenceType: "TEST",
                    description: "Should fail",
                    lines: [
                        {
                            ledgerAccountId: cash.id,
                            debit: "100.00",
                        },
                        {
                            ledgerAccountId: wallet.id,
                            credit: "100.00",
                        },
                    ],
                },
            );

            results.push({
                name: "Inactive ledger account rejected",
                passed: false,
                message:
                    "Operation unexpectedly succeeded.",
            });
        } catch (error) {
            results.push({
                name: "Inactive ledger account rejected",
                passed: true,
                message:
                    error instanceof Error
                        ? error.message
                        : "Expected rejection occurred.",
            });
        }

        await tx.execute(sql`
      UPDATE ledger_accounts
      SET active = true,
          updated_at = now()
      WHERE id = ${wallet.id}
        AND shop_id = ${shop.id}
    `);
    });

    let validTransactionId: string | null =
        null;

    try {
        await db.transaction(async (tx) => {
            const result =
                await postLedgerTransactionInTransaction(
                    tx,
                    {
                        shopId: shop.id,
                        userId: owner.userId,
                    },
                    {
                        referenceType: "TEST",
                        referenceId: null,
                        description:
                            ROLLBACK_MARKER,
                        lines: [
                            {
                                ledgerAccountId: cash.id,
                                debit: "100.00",
                                description:
                                    "Integrity test debit",
                            },
                            {
                                ledgerAccountId: wallet.id,
                                credit: "100.00",
                                description:
                                    "Integrity test credit",
                            },
                        ],
                    },
                );

            validTransactionId =
                result.transactionId;

            if (
                result.totalDebit !== "100.00" ||
                result.totalCredit !== "100.00" ||
                result.entryCount !== 2
            ) {
                throw new Error(
                    "Valid transaction returned unexpected totals.",
                );
            }

            /**
             * Force deferred database constraints to validate
             * before we deliberately roll back the test.
             */
            await tx.execute(
                sql`SET CONSTRAINTS ALL IMMEDIATE`,
            );

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
                name: "Valid balanced transaction accepted",
                passed: true,
                message:
                    "Transaction inserted successfully and rollback completed intentionally.",
            });
        } else {
            results.push({
                name: "Valid balanced transaction accepted",
                passed: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Unexpected database error.",
            });
        }
    }

    const rollbackCheck =
        await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count
      FROM ledger_transactions
      WHERE shop_id = ${shop.id}
        AND reference_type = 'TEST'
        AND description = ${ROLLBACK_MARKER}
    `);

    results.push({
        name: "Valid test transaction rolled back",
        passed:
            rollbackCheck.rows[0]?.count === "0",
        message:
            rollbackCheck.rows[0]?.count === "0"
                ? "No test journal entry remains in the database."
                : `Found ${rollbackCheck.rows[0]?.count ?? "unknown"} test transaction(s).`,
    });

    console.log("\nRESULTS");
    console.table(results);

    const failures = results.filter(
        (result) => !result.passed,
    );

    if (failures.length > 0) {
        throw new Error(
            `${failures.length} ledger integrity test(s) failed.`,
        );
    }

    console.log(
        "\nAll ledger integrity tests passed.",
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