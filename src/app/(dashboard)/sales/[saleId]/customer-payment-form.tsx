"use client";

import { useActionState } from "react";

import { recordSalePaymentAction, type SalePaymentActionState } from "./payment-actions";

type PaymentAccount = { id: string; name: string; kind: string };
const initialState: SalePaymentActionState = { status: "idle", message: "" };

export default function CustomerPaymentForm({
  saleId,
  documentNo,
  outstandingAmount,
  paymentAccounts,
}: {
  saleId: string;
  documentNo: string;
  outstandingAmount: string;
  paymentAccounts: PaymentAccount[];
}) {
  const [state, formAction, pending] = useActionState(recordSalePaymentAction, initialState);
  if (paymentAccounts.length === 0) {
    return <div className="rounded-lg border border-amber-300 p-4 text-sm text-amber-900 dark:border-amber-900 dark:text-amber-200">No active receiving account is configured, so a customer payment cannot be recorded.</div>;
  }

  return (
    <form action={formAction} onSubmit={(event) => {
      if (!window.confirm(`Record a real customer payment of up to Rs ${outstandingAmount} against ${documentNo}? Only submit an amount that has actually been received.`)) event.preventDefault();
    }} className="space-y-3 rounded-xl border bg-card p-4">
      <input type="hidden" name="saleId" value={saleId} />
      <div><h3 className="font-semibold">Record customer payment</h3><p className="mt-1 text-sm text-muted-foreground">Outstanding balance: <span className="font-semibold tabular-nums">Rs {outstandingAmount}</span>. The collection will debit the receiving account and credit Accounts Receivable.</p></div>
      <label className="block space-y-1 text-sm"><span className="font-medium">Received into</span><select name="financialAccountId" required disabled={pending} className="h-10 w-full rounded-md border bg-background px-3">{paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.kind.replaceAll("_", " ")}</option>)}</select></label>
      <label className="block space-y-1 text-sm"><span className="font-medium">Amount received (Rs)</span><input name="amount" type="number" required min="0.01" max={outstandingAmount} step="0.01" inputMode="decimal" disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 text-right tabular-nums" placeholder="Amount actually received" /></label>
      {state.status !== "idle" ? <div role="status" className={`rounded-md border p-3 text-sm ${state.status === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>{state.message}</div> : null}
      <button type="submit" disabled={pending} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Recording payment…" : "Record payment"}</button>
    </form>
  );
}
