import "server-only";

import Decimal from "decimal.js";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  auditLogs,
  financialAccounts,
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  salePayments,
  saleReturnItems,
  saleReturns,
  sales,
} from "@/db/schema";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MONEY = new Decimal("999999999999.99");

export class CustomerPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerPaymentError";
  }
}

function parseAmount(value: string): Decimal {
  const normalized = value.trim();
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new CustomerPaymentError("Payment amount must be a valid amount with up to two decimal places.");
  }
  const amount = new Decimal(normalized);
  if (!amount.isFinite() || amount.lte(0) || amount.gt(MAX_MONEY)) {
    throw new CustomerPaymentError("Payment amount must be greater than zero and within the supported range.");
  }
  return amount;
}

function cents(value: Decimal | string | number): number {
  return new Decimal(value).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function moneyFromCents(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new CustomerPaymentError("The calculated amount is outside the supported range.");
  return new Decimal(value).div(100).toFixed(2);
}

export async function recordCustomerPaymentForSaleForShop(input: {
  shopId: string;
  createdBy: string;
  saleId: string;
  financialAccountId: string;
  amount: string;
}) {
  if (!UUID_PATTERN.test(input.saleId)) throw new CustomerPaymentError("The sale reference is invalid.");
  if (!UUID_PATTERN.test(input.financialAccountId)) throw new CustomerPaymentError("Select a valid receiving account.");
  const amount = parseAmount(input.amount);
  const amountCents = cents(amount);

  return db.transaction(async (tx) => {
    const [sale] = await tx
      .select({ id: sales.id, documentNo: sales.documentNo, customerId: sales.customerId, status: sales.status, totalAmount: sales.totalAmount })
      .from(sales)
      .where(and(eq(sales.shopId, input.shopId), eq(sales.id, input.saleId)))
      .for("update");
    if (!sale) throw new CustomerPaymentError("The sale was not found in this shop.");
    if (sale.status !== "COMPLETED") throw new CustomerPaymentError("Payments can only be recorded against a completed sale.");
    const customerId = sale.customerId;
    if (!customerId) throw new CustomerPaymentError("This sale has no customer attached. Customer payments cannot be recorded against a walk-in sale.");

    const [paidRow] = await tx
      .select({ totalPaid: sql<string>`COALESCE(SUM(${salePayments.amount}::numeric), 0)::text` })
      .from(salePayments)
      .where(and(eq(salePayments.shopId, input.shopId), eq(salePayments.saleId, sale.id)));
    const [returnedRow] = await tx
      .select({ totalReturned: sql<string>`COALESCE(SUM(${saleReturnItems.amount}::numeric), 0)::text` })
      .from(saleReturnItems)
      .innerJoin(saleReturns, and(eq(saleReturns.shopId, saleReturnItems.shopId), eq(saleReturns.id, saleReturnItems.returnId)))
      .where(and(eq(saleReturnItems.shopId, input.shopId), eq(saleReturns.originalSaleId, sale.id), eq(saleReturns.status, "COMPLETED")));
    const [exchangeCreditRow] = await tx
      .select({ totalCredit: sql<string>`COALESCE(SUM(${saleReturnItems.amount}::numeric), 0)::text` })
      .from(saleReturnItems)
      .innerJoin(saleReturns, and(eq(saleReturns.shopId, saleReturnItems.shopId), eq(saleReturns.id, saleReturnItems.returnId)))
      .where(and(eq(saleReturnItems.shopId, input.shopId), eq(saleReturns.replacementSaleId, sale.id), eq(saleReturns.status, "COMPLETED")));
    const alreadyPaidCents = cents(paidRow?.totalPaid ?? "0");
    const alreadyReturnedCents = cents(returnedRow?.totalReturned ?? "0");
    const exchangeCreditCents = cents(exchangeCreditRow?.totalCredit ?? "0");
    const saleTotalCents = cents(sale.totalAmount);
    const outstandingCents = Math.max(0, saleTotalCents - alreadyPaidCents - alreadyReturnedCents - exchangeCreditCents);
    if (outstandingCents <= 0) throw new CustomerPaymentError("This sale has no outstanding balance.");
    if (amountCents > outstandingCents) {
      throw new CustomerPaymentError(`Payment exceeds the outstanding balance of Rs ${moneyFromCents(outstandingCents)}.`);
    }

    const [paymentAccount] = await tx
      .select({
        id: financialAccounts.id,
        name: financialAccounts.name,
        ledgerAccountId: ledgerAccounts.id,
        accountType: ledgerAccounts.accountType,
        normalBalance: ledgerAccounts.normalBalance,
        ledgerActive: ledgerAccounts.active,
        isActive: financialAccounts.isActive,
      })
      .from(financialAccounts)
      .innerJoin(ledgerAccounts, and(eq(ledgerAccounts.id, financialAccounts.ledgerAccountId), eq(ledgerAccounts.shopId, financialAccounts.shopId)))
      .where(and(eq(financialAccounts.shopId, input.shopId), eq(financialAccounts.id, input.financialAccountId)))
      .for("update");
    if (!paymentAccount || !paymentAccount.isActive || !paymentAccount.ledgerActive || paymentAccount.accountType !== "ASSET" || paymentAccount.normalBalance !== "DEBIT") {
      throw new CustomerPaymentError("The selected receiving account is inactive or is not a valid asset account.");
    }

    const [receivable] = await tx
      .select({ id: ledgerAccounts.id, accountType: ledgerAccounts.accountType, normalBalance: ledgerAccounts.normalBalance, active: ledgerAccounts.active })
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, input.shopId), eq(ledgerAccounts.code, "1300")))
      .for("update");
    if (!receivable || !receivable.active || receivable.accountType !== "ASSET" || receivable.normalBalance !== "DEBIT") {
      throw new CustomerPaymentError("The Accounts Receivable ledger account (code 1300) is missing, inactive, or incorrectly configured.");
    }

    const leafIds = [paymentAccount.ledgerAccountId, receivable.id];
    const children = await tx
      .select({ id: ledgerAccounts.id })
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.shopId, input.shopId), inArray(ledgerAccounts.parentId, leafIds)))
      .limit(1);
    if (children.length > 0) throw new CustomerPaymentError("A payment cannot post to a parent ledger account. Choose a leaf receiving account and verify Accounts Receivable.");

    const [receivableBalanceRow] = await tx
      .select({ balance: sql<string>`COALESCE(SUM(${ledgerEntries.debit}::numeric - ${ledgerEntries.credit}::numeric), 0)::text` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.shopId, input.shopId), eq(ledgerEntries.ledgerAccountId, receivable.id)));
    if (cents(receivableBalanceRow?.balance ?? "0") < amountCents) {
      throw new CustomerPaymentError("The Accounts Receivable ledger balance is lower than this collection. Check the ledger before recording it.");
    }

    await tx.insert(salePayments).values({
      shopId: input.shopId,
      saleId: sale.id,
      financialAccountId: paymentAccount.id,
      amount: moneyFromCents(amountCents),
      createdBy: input.createdBy,
    });

    const journalLines = [
      { ledgerAccountId: paymentAccount.ledgerAccountId, debit: moneyFromCents(amountCents), credit: "0.00", description: `Customer collection into ${paymentAccount.name} - ${sale.documentNo}` },
      { ledgerAccountId: receivable.id, debit: "0.00", credit: moneyFromCents(amountCents), description: `Accounts receivable collected - ${sale.documentNo}` },
    ];
    const debitTotal = journalLines.reduce((total, line) => total.plus(line.debit), new Decimal(0));
    const creditTotal = journalLines.reduce((total, line) => total.plus(line.credit), new Decimal(0));
    if (!debitTotal.equals(creditTotal)) throw new CustomerPaymentError("The collection journal is not balanced. Nothing was posted.");

    const [journal] = await tx
      .insert(ledgerTransactions)
      .values({
        shopId: input.shopId,
        referenceType: "SALE_PAYMENT",
        referenceId: sale.id,
        description: `Customer payment recorded for ${sale.documentNo}`,
        createdBy: input.createdBy,
      })
      .returning({ id: ledgerTransactions.id });
    await tx.insert(ledgerEntries).values(journalLines.map((line) => ({ shopId: input.shopId, ledgerTransactionId: journal.id, ...line })));

    const outstandingAfterCents = outstandingCents - amountCents;
    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.createdBy,
      action: "CUSTOMER_PAYMENT_RECORDED",
      entityType: "SALE",
      entityId: sale.id,
      metadata: {
        documentNo: sale.documentNo,
        customerId,
        financialAccountId: paymentAccount.id,
        financialAccountName: paymentAccount.name,
        amount: moneyFromCents(amountCents),
        outstandingBefore: moneyFromCents(outstandingCents),
        outstandingAfter: moneyFromCents(outstandingAfterCents),
      },
    });

    return {
      documentNo: sale.documentNo,
      customerId,
      amount: moneyFromCents(amountCents),
      outstandingAfter: moneyFromCents(outstandingAfterCents),
      paymentAccountName: paymentAccount.name,
    };
  });
}
