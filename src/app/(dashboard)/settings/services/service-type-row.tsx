"use client";

import { useActionState } from "react";

import { updateServiceTypeAction, type ServiceTypeActionState } from "./actions";

type ServiceType = { id: string; code: string; name: string; category: string; defaultFee: string; providerMoneyDirection: "IN" | "OUT" | "NONE"; active: boolean };
const initial: ServiceTypeActionState = { status: "idle", message: "" };

export default function ServiceTypeRow({ type }: { type: ServiceType }) {
  const [state, formAction, pending] = useActionState(updateServiceTypeAction, initial);
  return <form action={formAction} className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_160px_130px_auto] md:items-end"><input type="hidden" name="serviceTypeId" value={type.id} />
    <div className="space-y-1"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{type.code}</p><label className="block space-y-1 text-sm"><span className="font-medium">Display name</span><input name="name" required minLength={2} maxLength={100} defaultValue={type.name} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3" /></label><label className="block space-y-1 text-sm"><span className="font-medium">Category</span><input name="category" required minLength={2} maxLength={30} pattern="[A-Za-z][A-Za-z0-9_]{1,29}" defaultValue={type.category} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 uppercase" /></label></div>
    <label className="block space-y-1 text-sm"><span className="font-medium">Direction</span><select name="direction" defaultValue={type.providerMoneyDirection} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3"><option value="IN">IN</option><option value="OUT">OUT</option><option value="NONE">NONE</option></select><span className="text-xs text-muted-foreground">Changing affects new transactions only.</span></label>
    <label className="block space-y-1 text-sm"><span className="font-medium">Default fee (PKR)</span><input name="defaultFee" type="number" required min="0" max="999999999999.99" step="0.01" defaultValue={type.defaultFee} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 text-right tabular-nums" /></label>
    <label className="block space-y-1 text-sm"><span className="font-medium">Availability</span><select name="active" defaultValue={type.active ? "true" : "false"} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3"><option value="true">Active</option><option value="false">Inactive</option></select></label>
    <div className="md:col-span-2"><button type="submit" disabled={pending} className="h-10 rounded-md border px-4 text-sm font-semibold disabled:opacity-50">{pending ? "Saving…" : "Save type"}</button>{state.status !== "idle" ? <p role={state.status === "error" ? "alert" : "status"} className={`mt-2 text-xs ${state.status === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"}`}>{state.message}</p> : null}</div>
  </form>;
}
