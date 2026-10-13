"use client";

import { useActionState } from "react";
import { createExpenseAction } from "./actions";

const initialState = { status: "idle" as const, message: "" };
type Option = { id: string; name: string };

export default function ExpenseCreateForm({ categories, accounts, defaultFinancialAccountId, today }: { categories: Option[]; accounts: Option[]; defaultFinancialAccountId: string | null; today: string }) {
  const [state, action, pending] = useActionState(createExpenseAction, initialState);
  return (
    <form action={action} className="space-y-4 rounded-xl border bg-card p-5">
      <div><h2 className="font-semibold">Record an expense</h2><p className="mt-1 text-sm text-muted-foreground">Posted expenses immediately create an immutable, balanced journal. Corrections should use a reversal workflow rather than editing the entry.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1.5 text-sm font-medium"><span>Expense category</span><select name="categoryId" required className="w-full rounded-md border bg-background px-3 py-2 font-normal"><option value="">Select category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="space-y-1.5 text-sm font-medium"><span>Paid from</span><select name="financialAccountId" defaultValue={defaultFinancialAccountId ?? ""} required className="w-full rounded-md border bg-background px-3 py-2 font-normal"><option value="">Select account</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="space-y-1.5 text-sm font-medium"><span>Amount (PKR)</span><input name="amount" type="number" min="0.01" step="0.01" required inputMode="decimal" placeholder="0.00" className="w-full rounded-md border bg-background px-3 py-2 font-normal" /></label>
        <label className="space-y-1.5 text-sm font-medium"><span>Expense date</span><input name="expenseDate" type="date" defaultValue={today} max={today} required className="w-full rounded-md border bg-background px-3 py-2 font-normal" /></label>
        <label className="space-y-1.5 text-sm font-medium"><span>Payee (optional)</span><input name="payee" maxLength={200} placeholder="Person or business paid" className="w-full rounded-md border bg-background px-3 py-2 font-normal" /></label>
        <label className="space-y-1.5 text-sm font-medium sm:col-span-2 lg:col-span-3"><span>Notes (optional)</span><textarea name="notes" rows={2} maxLength={2000} placeholder="Receipt number or business purpose" className="w-full rounded-md border bg-background px-3 py-2 font-normal" /></label>
      </div>
      {state.message ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${state.status === "error" ? "border-destructive/40 text-destructive" : state.status === "success" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{state.message}</p> : null}
      <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={pending || categories.length === 0 || accounts.length === 0} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{pending ? "Recording…" : "Record expense"}</button>{categories.length === 0 ? <span className="text-sm text-muted-foreground">Create or activate an expense category in Settings → Expenses first.</span> : null}{accounts.length === 0 ? <span className="text-sm text-muted-foreground">No eligible financial accounts are available.</span> : null}</div>
    </form>
  );
}
