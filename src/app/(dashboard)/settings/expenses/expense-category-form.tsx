"use client";

import { useActionState } from "react";
import { createExpenseCategoryAction } from "./actions";

const initialState = { status: "idle" as const, message: "" };
type LedgerOption = { id: string; code: string; name: string };

export default function ExpenseCategoryForm({ accounts }: { accounts: LedgerOption[] }) {
  const [state, action, pending] = useActionState(createExpenseCategoryAction, initialState);
  return (
    <form action={action} className="space-y-4 rounded-xl border bg-card p-5">
      <div><h2 className="font-semibold">Create expense category</h2><p className="mt-1 text-sm text-muted-foreground">Every category maps to one leaf expense ledger account. This mapping determines where the debit posts.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium"><span>Category name</span><input name="name" minLength={2} maxLength={100} required placeholder="e.g. Shop cleaning" className="w-full rounded-md border bg-background px-3 py-2 font-normal" /></label>
        <label className="space-y-1.5 text-sm font-medium"><span>Expense ledger account</span><select name="ledgerAccountId" required className="w-full rounded-md border bg-background px-3 py-2 font-normal"><option value="">Select expense account</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
      </div>
      {state.message ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${state.status === "error" ? "border-destructive/40 text-destructive" : "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"}`}>{state.message}</p> : null}
      <button type="submit" disabled={pending || accounts.length === 0} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{pending ? "Saving…" : "Create category"}</button>
    </form>
  );
}
