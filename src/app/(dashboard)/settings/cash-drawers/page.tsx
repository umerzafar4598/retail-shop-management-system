import Link from "next/link";

import { requirePermission } from "@/lib/authorization";
import { getCashDrawerSettingsPageData } from "@/lib/cash/cash-drawer-settings";
import CashDrawerDefaultsForm from "./cash-drawer-defaults-form";

export default async function CashDrawerSettingsPage() {
  const shop = await requirePermission("cash_drawers.manage");
  const data = await getCashDrawerSettingsPageData(shop.shopId);
  return <main className="space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">Settings / Finance / Cash control</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Cash Drawer Defaults</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Keep retail and service cash physically separate. Each drawer is still a normal financial account with its own ledger balance and independent cash-session history.</p></div><div className="flex flex-wrap gap-3 text-sm"><Link href="/settings/finance/accounts" className="underline underline-offset-4">Financial accounts</Link><Link href="/cash-sessions" className="underline underline-offset-4">Cash sessions</Link></div></header>
    <section className="grid gap-4 md:grid-cols-2"><article className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Retail / accessories</h2><p className="mt-2 text-sm text-muted-foreground">Default POS payment account and default account for expenses. Cash purchases, transfers and refunds still use the account actually involved.</p></article><article className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Services</h2><p className="mt-2 text-sm text-muted-foreground">Default account for customer cash received for services, and default cash account for payouts when a provider-IN service is completed.</p></article></section>
    <CashDrawerDefaultsForm accounts={data.accounts} retailCashAccountId={data.retailCashAccountId} serviceCashAccountId={data.serviceCashAccountId} retailHasExplicitAssignment={data.retailHasExplicitAssignment} servicesHasExplicitAssignment={data.servicesHasExplicitAssignment} invalidRetailAssignment={data.invalidRetailAssignment} invalidServicesAssignment={data.invalidServicesAssignment} />
    <section className="rounded-xl border bg-muted/20 p-4 text-sm"><h2 className="font-semibold">Important</h2><p className="mt-2 text-muted-foreground">Create separate accounts through Financial Accounts first, for example “Retail Cash Drawer” and “Services Cash Drawer”, both with kind CASH. This page assigns workflow defaults only; it does not move any money, modify historical transactions, or merge account balances. Opening and closing physical counts are managed separately under Cash Sessions.</p></section>
  </main>;
}
