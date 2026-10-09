import "server-only";

import Decimal from "decimal.js";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
    auditLogs,
    financialAccounts,
    ledgerAccounts,
    ledgerEntries,
    ledgerTransactions,
    purchasePayments,
    purchases,
} from "@/db/schema";

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_MONEY = new Decimal("999999999999.99");

export class SupplierPaymentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SupplierPaymentError";
    }
}

function parsePaymentAmount(value: string): Decimal {
    const normalized = value.trim();

    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) {
        throw new SupplierPaymentError(
            "Enter a valid payment amount with no more than two decimal places.",
        );
    }

    const amount = new Decimal(normalized);

    if (
        !amount.isFinite() ||
        amount.lessThanOrEqualTo(0) ||
        amount.greaterThan(MAX_MONEY)
    ) {
        throw new SupplierPaymentError(
            "The payment amount must be positive and within the supported range.",
        );
    }

    return amount;
}

export async function recordSupplierPaymentForShop(input: {
    shopId: string;
    createdBy: string;
    purchaseId: string;
    financialAccountId: string;
    amount: string;
}) {
    const {
        shopId,
        createdBy,
        purchaseId,
        financialAccountId,
    } = input;

    if (
        !UUID_PATTERN.test(purchaseId) ||
        !UUID_PATTERN.test(financialAccountId)
    ) {
        throw new SupplierPaymentError(
            "Select a valid purchase and financial account.",
        );
    }

    const amount = parsePaymentAmount(input.amount);

    return db.transaction(async (tx) => {
        // Serialize payments for this purchase. Two concurrent requests
        // cannot both spend the same outstanding payable.
        const [purchase] = await tx
            .select({
                id: purchases.id,
                documentNo: purchases.documentNo,
                status: purchases.status,
                totalAmount: purchases.totalAmount,
            })
            .from(purchases)
            .where(
                and(
                    eq(purchases.id, purchaseId),
                    eq(purchases.shopId, shopId),
                ),
            )
            .for("update")
            .limit(1);

        if (!purchase) {
            throw new SupplierPaymentError(
                "Purchase not found in this shop.",
            );
        }

        if (purchase.status !== "POSTED") {
            throw new SupplierPaymentError(
                "Supplier payments can only be recorded against a posted purchase.",
            );
        }

        const previousPayments = await tx
            .select({
                amount: purchasePayments.amount,
            })
            .from(purchasePayments)
            .where(
                and(
                    eq(purchasePayments.shopId, shopId),
                    eq(purchasePayments.purchaseId, purchaseId),
                ),
            );

        const alreadyPaid = previousPayments.reduce(
            (total, payment) => total.plus(payment.amount),
            new Decimal(0),
        );

        const purchaseTotal = new Decimal(purchase.totalAmount);
        const outstandingBefore = purchaseTotal.minus(alreadyPaid);

        if (outstandingBefore.lessThanOrEqualTo(0)) {
            throw new SupplierPaymentError(
                "This purchase has no remaining payable balance.",
            );
        }

        if (amount.greaterThan(outstandingBefore)) {
            throw new SupplierPaymentError(
                `Payment exceeds the remaining payable of Rs ${outstandingBefore.toFixed(2)}.`,
            );
        }

        // Verify and lock the exact shop financial account and its ledger mapping.
        const [account] = await tx
            .select({
                id: financialAccounts.id,
                name: financialAccounts.name,
                ledgerAccountId: financialAccounts.ledgerAccountId,
                accountType: ledgerAccounts.accountType,
                normalBalance: ledgerAccounts.normalBalance,
                ledgerActive: ledgerAccounts.active,
            })
            .from(financialAccounts)
            .innerJoin(
                ledgerAccounts,
                and(
                    eq(ledgerAccounts.id, financialAccounts.ledgerAccountId),
                    eq(ledgerAccounts.shopId, financialAccounts.shopId),
                ),
            )
            .where(
                and(
                    eq(financialAccounts.id, financialAccountId),
                    eq(financialAccounts.shopId, shopId),
                    eq(financialAccounts.isActive, true),
                ),
            )
            .for("update")
            .limit(1);

        if (
            !account ||
            !account.ledgerActive ||
            account.accountType !== "ASSET" ||
            account.normalBalance !== "DEBIT"
        ) {
            throw new SupplierPaymentError(
                "The selected financial account is inactive or cannot hold an asset balance.",
            );
        }

        // The posting engine forbids direct entries to parent ledger accounts.
        const accountChildren = await tx
            .select({ id: ledgerAccounts.id })
            .from(ledgerAccounts)
            .where(
                and(
                    eq(ledgerAccounts.shopId, shopId),
                    eq(ledgerAccounts.parentId, account.ledgerAccountId),
                ),
            )
            .limit(1);

        if (accountChildren.length > 0) {
            throw new SupplierPaymentError(
                "The selected financial account maps to a parent ledger account and cannot receive direct postings.",
            );
        }

        // This is the balance recorded in the ledger, not a user-entered balance.
        const [balanceResult] = await tx
            .select({
                balance: sql<string>`
          COALESCE(
            SUM(${ledgerEntries.debit} - ${ledgerEntries.credit}),
            0
          )::text
        `,
            })
            .from(ledgerEntries)
            .where(
                and(
                    eq(ledgerEntries.shopId, shopId),
                    eq(ledgerEntries.ledgerAccountId, account.ledgerAccountId),
                ),
            );

        const availableBalance = new Decimal(
            balanceResult?.balance ?? "0",
        );

        if (availableBalance.lessThan(amount)) {
            throw new SupplierPaymentError(
                `${account.name} has an insufficient recorded balance. Available: Rs ${availableBalance.toFixed(2)}.`,
            );
        }

        // Accounts Payable must be a valid, active posting account.
        const [payableAccount] = await tx
            .select({
                id: ledgerAccounts.id,
                accountType: ledgerAccounts.accountType,
                normalBalance: ledgerAccounts.normalBalance,
                active: ledgerAccounts.active,
            })
            .from(ledgerAccounts)
            .where(
                and(
                    eq(ledgerAccounts.shopId, shopId),
                    eq(ledgerAccounts.code, "2000"),
                ),
            )
            .for("update")
            .limit(1);

        if (
            !payableAccount ||
            !payableAccount.active ||
            payableAccount.accountType !== "LIABILITY" ||
            payableAccount.normalBalance !== "CREDIT"
        ) {
            throw new SupplierPaymentError(
                "The Accounts Payable ledger account is missing or incorrectly configured.",
            );
        }

        const payableChildren = await tx
            .select({ id: ledgerAccounts.id })
            .from(ledgerAccounts)
            .where(
                and(
                    eq(ledgerAccounts.shopId, shopId),
                    eq(ledgerAccounts.parentId, payableAccount.id),
                ),
            )
            .limit(1);

        if (payableChildren.length > 0) {
            throw new SupplierPaymentError(
                "Accounts Payable is a parent ledger account and cannot receive direct postings.",
            );
        }

        const outstandingAfter = outstandingBefore.minus(amount);

        // Both business record and journal will roll back together on failure.
        await tx.insert(purchasePayments).values({
            shopId,
            purchaseId,
            financialAccountId: account.id,
            amount: amount.toFixed(2),
            createdBy,
        });

        const [journal] = await tx
            .insert(ledgerTransactions)
            .values({
                shopId,
                referenceType: "PURCHASE_PAYMENT",
                referenceId: purchase.id,
                description: `Supplier payment for ${purchase.documentNo}`,
                createdBy,
            })
            .returning({
                id: ledgerTransactions.id,
            });

        await tx.insert(ledgerEntries).values([
            {
                shopId,
                ledgerTransactionId: journal.id,
                ledgerAccountId: payableAccount.id,
                debit: amount.toFixed(2),
                credit: "0.00",
                description: `Reduce supplier payable - ${purchase.documentNo}`,
            },
            {
                shopId,
                ledgerTransactionId: journal.id,
                ledgerAccountId: account.ledgerAccountId,
                debit: "0.00",
                credit: amount.toFixed(2),
                description: `Supplier payment from ${account.name}`,
            },
        ]);

        await tx.insert(auditLogs).values({
            shopId,
            actorUserId: createdBy,
            action: "SUPPLIER_PAYMENT_RECORDED",
            entityType: "PURCHASE",
            entityId: purchase.id,
            metadata: {
                documentNo: purchase.documentNo,
                amount: amount.toFixed(2),
                financialAccountId: account.id,
                financialAccountName: account.name,
                outstandingBefore: outstandingBefore.toFixed(2),
                outstandingAfter: outstandingAfter.toFixed(2),
            },
        });

        return {
            documentNo: purchase.documentNo,
            amountPaid: amount.toFixed(2),
            outstandingAfter: outstandingAfter.toFixed(2),
        };
    });
}