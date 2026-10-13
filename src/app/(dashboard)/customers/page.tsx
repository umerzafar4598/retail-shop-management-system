import Decimal from "decimal.js";
import Link from "next/link";

import { hasPermission, requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { listCustomersForShop } from "@/lib/pos/customers";
import CustomerCreateForm from "./customer-create-form";

const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPKR = (value: string | number) => `Rs ${moneyFormatter.format(Number(value))}`;

export default async function CustomersPage() {
  const shop = await requirePermission("customers.view");
  const session = await requireSession();
  const canCreateCustomer = await hasPermission(session.user.id, shop.shopId, "customers.create");
  const customers = await listCustomersForShop(shop.shopId);
  const totalOutstanding = customers.reduce((total, customer) => total.plus(customer.outstandingBalance), new Decimal(0)).toFixed(2);

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Sales / Customer accounts</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Maintain customer records, view credit balances, and open each customer's sales history. Walk-in sales do not create a customer balance.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/pos" className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted">Open POS</Link>
          <Link href="/sales" className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted">Sales history</Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Active customers</p><p className="mt-2 text-2xl font-semibold tabular-nums">{customers.length}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Outstanding customer credit</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatPKR(totalOutstanding)}</p></div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-4 py-4"><h2 className="font-semibold">Customer list</h2><p className="mt-1 text-sm text-muted-foreground">Balances are calculated from completed sales minus recorded payments.</p></div>
          {customers.length === 0 ? (
            <div className="p-8 text-center"><p className="font-medium">No active customers yet</p><p className="mt-1 text-sm text-muted-foreground">Add a customer before recording credit sales.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Phone</th><th className="px-4 py-3 text-right font-medium">Outstanding</th></tr></thead>
                <tbody className="divide-y">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3"><Link href={`/customers/${customer.id}`} className="font-medium underline-offset-4 hover:underline">{customer.name}</Link></td>
                      <td className="px-4 py-3 text-muted-foreground">{customer.phone ?? "—"}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${Number(customer.outstandingBalance) > 0 ? "text-amber-700 dark:text-amber-300" : ""}`}>{formatPKR(customer.outstandingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {canCreateCustomer ? <CustomerCreateForm /> : <section className="rounded-xl border p-4 text-sm text-muted-foreground">You have permission to view customers but not create new records.</section>}
      </div>
    </main>
  );
}
