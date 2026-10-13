"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { reverseExpenseAction, type ExpenseReversalActionState } from "./actions";

const initialState: ExpenseReversalActionState = { status: "idle", message: "" };
type Option = { id: string; name: string };

export default function ExpenseReversalForm({
  expenseId,
  documentNo,
  amount,
  categoryId,
  financialAccountId,
  expenseDate,
  payee,
  notes,
  categories,
  accounts,
  today,
}: {
  expenseId: string;
  documentNo: string;
  amount: string;
  categoryId: string;
  financialAccountId: string;
  expenseDate: string;
  payee: string | null;
  notes: string | null;
  categories: Option[];
  accounts: Option[];
  today: string;
}) {
  const [state, action, pending] = useActionState(reverseExpenseAction, initialState);
  const [createReplacement, setCreateReplacement] = useState(false);
  const validOriginalCategory = categories.some((item) => item.id === categoryId) ? categoryId : "";
  const validOriginalAccount = accounts.some((item) => item.id === financialAccountId) ? financialAccountId : "";

  return (
    <form action={action} onSubmit={(event) => {
      const operation = createReplacement
        ? "reverse this expense and post a corrected replacement in the same transaction"
        : "reverse this expense without posting a replacement";
      const warning = createReplacement
        ? " If any replacement validation fails, both operations roll back."
        : " Use reversal-only only if the payment never actually occurred, was a duplicate record, or the money was actually returned. If a real expense occurred but the details are wrong, choose the corrected replacement option.";
      if (!window.confirm(`You are about to ${operation}: ${documentNo}.${warning} The original record is preserved.`)) event.preventDefault();
    }} className="space-y-4 rounded-xl border border-destructive/25 bg-card p-5">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="mode" value={createReplacement ? "CORRECT" : "REVERSE_ONLY"} />

      <div>
        <h2 className="font-semibold">Reverse or correct posted expense</h2>
        <p className="mt-1 text-sm text-muted-foreground">The original expense and journal are never edited or deleted. A reversal creates a separate compensating journal.</p>
      </div>

      <div className="rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <strong>Choose carefully.</strong> Reversal-only restores the recorded amount to the original payment account in the ledger. Use it only when the original payment did not happen, was duplicated by mistake, or the money was actually returned. If the expense really happened but its amount, category, date, or payment account was recorded incorrectly, select the corrected replacement option.
      </div>

      <label className="block space-y-1.5 text-sm font-medium">
        <span>Reason for reversal / correction</span>
        <textarea name="reason" minLength={5} maxLength={1000} rows={3} required disabled={pending || state.status === "success"} placeholder="Explain what was incorrect and how it was checked…" className="w-full rounded-md border bg-background px-3 py-2 font-normal" />
      </label>

      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        <input type="checkbox" checked={createReplacement} onChange={(event) => setCreateReplacement(event.target.checked)} disabled={pending || state.status === "success"} className="mt-1" />
        <span>
          <span className="font-semibold">Also post the corrected replacement now</span>
          <span className="mt-1 block text-muted-foreground">Reverses the original and creates a new expense document atomically. If any replacement detail fails validation, neither change is saved.</span>
        </span>
      </label>

      {createReplacement ? (
        <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
          <div>
            <h3 className="font-semibold">Corrected replacement expense</h3>
            <p className="mt-1 text-sm text-muted-foreground">Values are prefilled from the original; change the incorrect fields.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              <span>Corrected category</span>
              <select name="replacementCategoryId" required disabled={pending || state.status === "success"} defaultValue={validOriginalCategory} className="w-full rounded-md border bg-background px-3 py-2 font-normal">
                <option value="">Choose category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Corrected paid-from account</span>
              <select name="replacementFinancialAccountId" required disabled={pending || state.status === "success"} defaultValue={validOriginalAccount} className="w-full rounded-md border bg-background px-3 py-2 font-normal">
                <option value="">Choose account</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Corrected amount (PKR)</span>
              <input name="replacementAmount" type="number" min="0.01" max="999999999999.99" step="0.01" required disabled={pending || state.status === "success"} defaultValue={amount} className="w-full rounded-md border bg-background px-3 py-2 font-normal" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Expense date</span>
              <input name="replacementExpenseDate" type="date" max={today} required disabled={pending || state.status === "success"} defaultValue={expenseDate} className="w-full rounded-md border bg-background px-3 py-2 font-normal" />
            </label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
              <span>Payee (optional)</span>
              <input name="replacementPayee" maxLength={200} disabled={pending || state.status === "success"} defaultValue={payee ?? ""} className="w-full rounded-md border bg-background px-3 py-2 font-normal" />
            </label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
              <span>Corrected notes (optional)</span>
              <textarea name="replacementNotes" rows={2} maxLength={2000} disabled={pending || state.status === "success"} defaultValue={notes ?? ""} className="w-full rounded-md border bg-background px-3 py-2 font-normal" />
            </label>
          </div>
          {categories.length === 0 || accounts.length === 0 ? <p className="text-sm text-destructive">An active expense category and payment account are required to post the replacement.</p> : null}
        </section>
      ) : null}

      {state.message ? (
        <div role={state.status === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-3 text-sm ${state.status === "error" ? "border-destructive/40 text-destructive" : state.status === "success" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>
          {state.message}
          {state.status === "success" ? <p className="mt-2"><Link href="/expenses" className="font-semibold underline underline-offset-4">Return to expenses</Link></p> : null}
        </div>
      ) : null}

      {state.status === "success" ? null : (
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending || (createReplacement && (categories.length === 0 || accounts.length === 0))} className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50">
            {pending ? "Processing…" : createReplacement ? "Reverse and post corrected expense" : "Reverse expense only"}
          </button>
          <Link href="/expenses" className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium">Cancel</Link>
        </div>
      )}
    </form>
  );
}
