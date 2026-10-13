"use client";

import { useActionState } from "react";
import {
  acknowledgeCashDiscrepancyAction,
  closeCashSessionAction,
  openCashSessionAction,
} from "./actions";

const initialState = { status: "idle" as const, message: "" };

type CashAccountOption = { id: string; name: string };

function FormMessage({ state }: { state: { status: string; message: string } }) {
  if (!state.message) return null;
  return <p role="status" className={`rounded-md border px-3 py-2 text-sm ${state.status === "error" ? "border-destructive/40 text-destructive" : state.status === "success" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{state.message}</p>;
}

export function OpenCashSessionForm({ accounts }: { accounts: CashAccountOption[] }) {
  const [state, action, pending] = useActionState(openCashSessionAction, initialState);
  return (
    <form action={action} className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">Open cash session</h2>
        <p className="mt-1 text-sm text-muted-foreground">Count the physical cash at the start. The system stores the current ledger balance as the baseline.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">
          <span>Cash drawer</span>
          <select name="financialAccountId" required className="w-full rounded-md border bg-background px-3 py-2 font-normal">
            <option value="">Select a cash drawer</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          <span>Opening physical cash (PKR)</span>
          <input name="openingAmount" type="number" min="0" step="0.01" required inputMode="decimal" placeholder="0.00" className="w-full rounded-md border bg-background px-3 py-2 font-normal" />
        </label>
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending || accounts.length === 0} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{pending ? "Opening…" : "Open session"}</button>
      {accounts.length === 0 ? <p className="text-sm text-muted-foreground">No eligible active cash drawers are available. Configure a financial account with kind CASH first.</p> : null}
    </form>
  );
}

export function CloseCashSessionForm({ cashSessionId }: { cashSessionId: string }) {
  const [state, action, pending] = useActionState(closeCashSessionAction, initialState);
  return (
    <form action={action} className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-4">
      <input type="hidden" name="cashSessionId" value={cashSessionId} />
      <label className="block space-y-1.5 text-sm font-medium">
        <span>Actual physical closing cash (PKR)</span>
        <input name="actualClosingAmount" type="number" min="0" step="0.01" required inputMode="decimal" placeholder="Counted cash" className="w-full rounded-md border bg-background px-3 py-2 font-normal" />
      </label>
      <p className="text-xs text-muted-foreground">Expected closing cash = opening physical cash + ledger balance movement since the session opened.</p>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{pending ? "Closing…" : "Record count and close"}</button>
    </form>
  );
}

export function AcknowledgeCashDiscrepancyForm({ cashSessionId }: { cashSessionId: string }) {
  const [state, action, pending] = useActionState(acknowledgeCashDiscrepancyAction, initialState);
  return (
    <form action={action} className="mt-4 space-y-3 rounded-lg border border-amber-500/40 bg-amber-50/50 p-4 dark:bg-amber-950/20">
      <input type="hidden" name="cashSessionId" value={cashSessionId} />
      <label className="block space-y-1.5 text-sm font-medium">
        <span>Discrepancy review note</span>
        <textarea name="reason" minLength={5} maxLength={1000} required rows={3} placeholder="Record what was checked and who approved the discrepancy…" className="w-full rounded-md border bg-background px-3 py-2 font-normal" />
      </label>
      <p className="text-xs text-muted-foreground">Acknowledgement closes the operational session but does not create a cash over/short journal. The difference remains in the history and audit log.</p>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">{pending ? "Saving…" : "Acknowledge and close session"}</button>
    </form>
  );
}
