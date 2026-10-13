"use client";

import { useActionState } from "react";
import { setExpenseCategoryActiveAction } from "./actions";

const initialState = { status: "idle" as const, message: "" };
export default function ExpenseCategoryRow({ category }: { category: { id: string; name: string; active: boolean; ledgerCode: string; ledgerName: string; ledgerAccountActive: boolean } }) {
  const [state, action, pending] = useActionState(setExpenseCategoryActiveAction, initialState);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4 first:border-t-0">
      <div><p className="font-medium">{category.name}</p><p className="mt-1 text-sm text-muted-foreground">{category.ledgerCode} — {category.ledgerName}{!category.ledgerAccountActive ? " (ledger account inactive)" : ""}</p><p className="mt-1 text-xs text-muted-foreground">{category.active ? "Active for new expenses" : "Inactive; historical expenses are retained"}</p>{state.message ? <p role="status" className={`mt-2 text-sm ${state.status === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"}`}>{state.message}</p> : null}</div>
      <form action={action}><input type="hidden" name="categoryId" value={category.id} /><input type="hidden" name="active" value={String(!category.active)} /><button type="submit" disabled={pending || (!category.ledgerAccountActive && !category.active)} className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">{pending ? "Saving…" : category.active ? "Deactivate" : "Reactivate"}</button></form>
    </div>
  );
}
