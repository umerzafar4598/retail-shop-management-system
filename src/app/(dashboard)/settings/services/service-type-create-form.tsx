"use client";

import { useActionState } from "react";

import { createServiceTypeAction, type ServiceTypeActionState } from "./actions";

const initial: ServiceTypeActionState = { status: "idle", message: "" };

export default function ServiceTypeCreateForm() {
  const [state, formAction, pending] = useActionState(createServiceTypeAction, initial);
  return <form action={formAction} className="space-y-4 rounded-xl border bg-card p-4 md:p-5"><div><h2 className="font-semibold">Add custom service type</h2><p className="mt-1 text-sm text-muted-foreground">Service type codes are permanent document keys. Existing transactions keep their saved service-type relationship.</p></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span className="font-medium">Code</span><input name="code" required minLength={3} maxLength={50} pattern="[A-Za-z][A-Za-z0-9_]{2,49}" disabled={pending} placeholder="e.g. INTERNET_BILL" className="h-10 w-full rounded-md border bg-background px-3 uppercase" /><span className="text-xs text-muted-foreground">Letters, digits, underscores; starts with a letter.</span></label><label className="space-y-1 text-sm"><span className="font-medium">Name</span><input name="name" required minLength={2} maxLength={100} disabled={pending} placeholder="Service display name" className="h-10 w-full rounded-md border bg-background px-3" /></label><label className="space-y-1 text-sm"><span className="font-medium">Category</span><input name="category" required minLength={2} maxLength={30} pattern="[A-Za-z][A-Za-z0-9_]{1,29}" defaultValue="OTHER" disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 uppercase" /><span className="text-xs text-muted-foreground">Examples: EASYPAISA, JAZZCASH, BANK, BILL_PAYMENT, NADRA, OTHER.</span></label><label className="space-y-1 text-sm"><span className="font-medium">Provider money direction</span><select name="direction" defaultValue="NONE" required disabled={pending} className="h-10 w-full rounded-md border bg-background px-3"><option value="OUT">OUT — principal leaves provider account</option><option value="IN">IN — funds arrive at provider account</option><option value="NONE">NONE — fee only, no provider principal</option></select></label><label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">Default fee (PKR)</span><input name="defaultFee" required type="number" min="0" max="999999999999.99" step="0.01" defaultValue="0.00" disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 text-right tabular-nums" /></label></div>
    {state.status !== "idle" ? <p role={state.status === "error" ? "alert" : "status"} className={`text-sm ${state.status === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"}`}>{state.message}</p> : null}
    <button type="submit" disabled={pending} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Saving…" : "Create service type"}</button>
  </form>;
}
