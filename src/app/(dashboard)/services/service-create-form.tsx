"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { createServiceTransactionAction, type ServiceActionState } from "./actions";

type ServiceType = { id: string; code: string; name: string; category: string; defaultFee: string; providerMoneyDirection: "IN" | "OUT" | "NONE" };
type Customer = { id: string; name: string; phone: string | null };
type Account = { id: string; name: string; kind: string; provider: string };
const initialState: ServiceActionState = { status: "idle", message: "" };
const money = (value: number) => `Rs ${Number.isFinite(value) ? value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;

export default function ServiceCreateForm({ types, customers, accounts }: { types: ServiceType[]; customers: Customer[]; accounts: Account[] }) {
  const [state, formAction, pending] = useActionState(createServiceTransactionAction, initialState);
  const [serviceTypeId, setServiceTypeId] = useState(types[0]?.id ?? "");
  const [principalAmount, setPrincipalAmount] = useState("0.00");
  const [serviceFee, setServiceFee] = useState(types[0]?.defaultFee ?? "0.00");
  const [providerAccountId, setProviderAccountId] = useState("");
  const [settlementAccountId, setSettlementAccountId] = useState("");
  const selectedType = useMemo(() => types.find((type) => type.id === serviceTypeId) ?? null, [types, serviceTypeId]);
  const direction = selectedType?.providerMoneyDirection ?? "NONE";
  const numericPrincipal = Number.parseFloat(principalAmount) || 0;
  const numericFee = Number.parseFloat(serviceFee) || 0;
  const total = numericPrincipal + numericFee;

  if (state.status === "success" && state.serviceId) {
    return <section className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><h2 className="font-semibold">Service recorded</h2><p className="text-sm">{state.message}</p><div className="flex flex-wrap gap-3"><Link href={`/services/${state.serviceId}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium">Open service record</Link><Link href="/services" className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium">Back to services</Link></div></section>;
  }

  return <form action={formAction} onSubmit={(event) => {
    const providerValid = direction === "NONE" || providerAccountId.length > 0;
    const settlementValid = direction === "IN" || settlementAccountId.length > 0;
    if (!selectedType || !providerValid || !settlementValid || total <= 0) { event.preventDefault(); return; }
    if (!window.confirm(`Record this real service transaction? Total Rs ${total.toFixed(2)} will be received into the selected customer/provider account and held in Service Clearing until completion or refund. Do not submit a fictitious provider transaction.`)) event.preventDefault();
  }} className="space-y-5 rounded-xl border bg-card p-4 md:p-5">
    <div><h2 className="text-lg font-semibold">Record a shop service</h2><p className="mt-1 text-sm text-muted-foreground">This application only records your staff workflow. Perform provider transactions in the real provider app or portal; no external integration is made.</p></div>
    <label className="block space-y-1 text-sm"><span className="font-medium">Service type</span><select name="serviceTypeId" value={serviceTypeId} onChange={(event) => { const next = types.find((type) => type.id === event.target.value); setServiceTypeId(event.target.value); setServiceFee(next?.defaultFee ?? "0.00"); if (next?.providerMoneyDirection === "NONE") setPrincipalAmount("0.00"); }} required disabled={pending || types.length === 0} className="h-10 w-full rounded-md border bg-background px-3">{types.map((type) => <option key={type.id} value={type.id}>{type.name} · {type.providerMoneyDirection}</option>)}</select><span className="text-xs text-muted-foreground">Configure service types and default fees in Settings → Services.</span></label>
    <label className="block space-y-1 text-sm"><span className="font-medium">Customer (optional)</span><select name="customerId" defaultValue="" disabled={pending} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Walk-in / not recorded</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}</select></label>

    {direction === "NONE" ? <><input type="hidden" name="principalAmount" value="0.00" /><div className="rounded-lg bg-muted/40 p-3 text-sm"><p className="font-medium">No external principal movement</p><p className="mt-1 text-muted-foreground">Use this for services such as biometric verification where the shop records a fee only.</p></div></> : <label className="block space-y-1 text-sm"><span className="font-medium">Principal amount (PKR)</span><input type="number" name="principalAmount" required min="0.01" max="999999999999.99" step="0.01" value={principalAmount} onChange={(event) => setPrincipalAmount(event.target.value)} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 text-right tabular-nums" /></label>}
    <label className="block space-y-1 text-sm"><span className="font-medium">Service fee (PKR)</span><input type="number" name="serviceFee" required min="0" max="999999999999.99" step="0.01" value={serviceFee} onChange={(event) => setServiceFee(event.target.value)} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 text-right tabular-nums" /><span className="text-xs text-muted-foreground">Default fee from the service type; change it to the actual fee charged on this transaction.</span></label>
    <div className="rounded-lg border p-3"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Customer transaction total</span><span className="text-lg font-semibold tabular-nums">{money(total)}</span></div></div>

    {direction !== "NONE" ? <label className="block space-y-1 text-sm"><span className="font-medium">Provider wallet / bank account</span><select name="providerAccountId" required value={providerAccountId} onChange={(event) => setProviderAccountId(event.target.value)} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Choose exact provider account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.provider} · {account.kind.replaceAll("_", " ")}</option>)}</select><span className="text-xs text-muted-foreground">Direction {direction}: {direction === "OUT" ? "principal will be deducted from this provider account when marked completed." : "the incoming transfer should already have reached this provider account; choose the customer payout account when completing the service."}</span></label> : null}

    {direction !== "IN" ? <label className="block space-y-1 text-sm"><span className="font-medium">Account receiving customer payment</span><select name="settlementAccountId" required value={settlementAccountId} onChange={(event) => setSettlementAccountId(event.target.value)} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Choose receiving account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.provider} · {account.kind.replaceAll("_", " ")}</option>)}</select></label> : <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">This is a provider-IN service. Record it after the incoming provider transfer has actually been received. The payout account is selected at service completion.</p>}

    <label className="block space-y-1 text-sm"><span className="font-medium">External provider reference (optional)</span><input type="text" name="externalReference" maxLength={150} disabled={pending} placeholder="Provider transaction / receipt reference" className="h-10 w-full rounded-md border bg-background px-3" /></label>
    <label className="block space-y-1 text-sm"><span className="font-medium">Notes (optional)</span><textarea name="notes" maxLength={1000} rows={2} disabled={pending} placeholder="Bill reference, verification purpose, or staff note" className="w-full rounded-md border bg-background px-3 py-2" /></label>
    {state.status === "error" ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{state.message}</div> : null}
    <button type="submit" disabled={pending || types.length === 0 || accounts.length === 0 || !selectedType} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Recording service…" : "Record service transaction"}</button>
  </form>;
}
