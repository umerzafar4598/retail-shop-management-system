"use client";

import Link from "next/link";
import { useActionState } from "react";

import { saveCashDrawerDefaultsAction } from "./actions";

const initialState = { status: "idle" as const, message: "" };
type AccountOption = { id: string; name: string };

export default function CashDrawerDefaultsForm({
  accounts,
  retailCashAccountId,
  serviceCashAccountId,
  retailHasExplicitAssignment,
  servicesHasExplicitAssignment,
  invalidRetailAssignment,
  invalidServicesAssignment,
}: {
  accounts: AccountOption[];
  retailCashAccountId: string;
  serviceCashAccountId: string;
  retailHasExplicitAssignment: boolean;
  servicesHasExplicitAssignment: boolean;
  invalidRetailAssignment: boolean;
  invalidServicesAssignment: boolean;
}) {
  const [state, action, pending] = useActionState(saveCashDrawerDefaultsAction, initialState);
  return <form action={action} className="space-y-5 rounded-xl border bg-card p-5">
    <div><h2 className="font-semibold">Default drawer assignments</h2><p className="mt-1 text-sm text-muted-foreground">These assignments choose the default account in each workflow. Staff can still select another actual payment account when a real transaction requires it.</p></div>
    <div className="grid gap-5 md:grid-cols-2">
      <label className="block space-y-1.5 text-sm font-medium"><span>Retail / accessories POS drawer</span>
        <select name="retailCashAccountId" defaultValue={retailCashAccountId} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 font-normal">
          <option value="">Not assigned</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <span className="block text-xs font-normal text-muted-foreground">Used as the first payment account in POS and the default “Paid from” account for expenses. Unpaid customer credit is still handled separately.</span>
        {invalidRetailAssignment ? <span className="block text-xs text-destructive">The currently assigned account is inactive or no longer qualifies as a cash drawer. Choose an active drawer or clear this assignment.</span> : !retailHasExplicitAssignment && retailCashAccountId ? <span className="block text-xs text-muted-foreground">Legacy fallback: Main Cash Drawer. Save to make this assignment explicit.</span> : null}
      </label>
      <label className="block space-y-1.5 text-sm font-medium"><span>Services cash drawer</span>
        <select name="serviceCashAccountId" defaultValue={serviceCashAccountId} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 font-normal">
          <option value="">Not assigned</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <span className="block text-xs font-normal text-muted-foreground">Used as the default receiving account when recording cash-funded services and as the default customer payout account for provider-IN services.</span>
        {invalidServicesAssignment ? <span className="block text-xs text-destructive">The currently assigned account is inactive or no longer qualifies as a cash drawer. Choose an active drawer or clear this assignment.</span> : null}
      </label>
    </div>
    {accounts.length === 0 ? <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">No eligible cash drawers are available. Create or activate financial accounts with kind CASH and a postable leaf asset ledger account first.</div> : null}
    <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={pending || accounts.length === 0} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Saving…" : "Save drawer defaults"}</button><Link href="/settings/finance/accounts" className="text-sm font-medium underline underline-offset-4">Manage financial accounts</Link></div>
    {state.message ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${state.status === "error" ? "border-destructive/40 text-destructive" : state.status === "success" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{state.message}</p> : null}
  </form>;
}
