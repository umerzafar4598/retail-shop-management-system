"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createCustomerAction, type CustomerActionState } from "./actions";

const initialState: CustomerActionState = { status: "idle", message: "" };

export default function CustomerCreateForm() {
  const [state, formAction, pending] = useActionState(createCustomerAction, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
      <div>
        <h2 className="font-semibold">Add customer</h2>
        <p className="mt-1 text-sm text-muted-foreground">Customers can be attached to receipts and used for tracking credit balances.</p>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Customer name *</span>
        <input name="name" required minLength={2} maxLength={150} autoComplete="name" disabled={pending} className="h-10 w-full rounded-md border bg-background px-3" placeholder="Customer full name" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Phone number</span>
        <input name="phone" maxLength={40} autoComplete="tel" disabled={pending} className="h-10 w-full rounded-md border bg-background px-3" placeholder="03xx-xxxxxxx" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Notes</span>
        <textarea name="notes" maxLength={1000} rows={2} disabled={pending} className="w-full rounded-md border bg-background px-3 py-2" placeholder="Optional notes" />
      </label>
      {state.status !== "idle" ? (
        <div role="status" className={`rounded-md border p-3 text-sm ${state.status === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
          <p>{state.message}</p>
          {state.status === "success" && state.customerId ? <Link className="mt-2 inline-flex font-medium underline underline-offset-4" href={`/customers/${state.customerId}`}>Open customer account</Link> : null}
        </div>
      ) : null}
      <button type="submit" disabled={pending} className="h-10 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {pending ? "Saving customer…" : "Add customer"}
      </button>
    </form>
  );
}
