import Decimal from "decimal.js";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/authorization";
import { getCustomerDetailsForShop } from "@/lib/pos/customers";

const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPKR = (value: string | number) => `Rs ${moneyFormatter.format(Number(value))}`;

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const shop = await requirePermission("customers.view");
  const { customerId } = await params;
  const details = await getCustomerDetailsForShop(shop.shopId, customerId);
  if (!details) notFound();
  const { customer, sales, outstandingBalance } = details;

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Link href="/customers" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Customers</Link><h1 className="mt-2 text-2xl font-semibold tracking-tight">{customer.name}</h1><p className="mt-1 text-sm text-muted-foreground">{customer.phone ?? "No phone recorded"}</p>{customer.notes ? <p className="mt-2 max-w-2xl text-sm">{customer.notes}</p> : null}</div>
        <Link href="/pos" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">New sale</Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Outstanding balance</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatPKR(outstandingBalance)}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Recent sale documents (max 100)</p><p className="mt-2 text-2xl font-semibold tabular-nums">{sales.filter((sale) => sale.status === "COMPLETED").length}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Sales total in recent history</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatPKR(sales.filter((sale) => sale.status === "COMPLETED").reduce((total, sale) => total.plus(sale.totalAmount), new Decimal(0)).toFixed(2))}</p></div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-4"><h2 className="font-semibold">Sales and credit history</h2><p className="mt-1 text-sm text-muted-foreground">Open a sale receipt to record a collection against its outstanding balance.</p></div>
        {sales.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No sale documents for this customer yet.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Sale</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 text-right font-medium">Sale total</th><th className="px-4 py-3 text-right font-medium">Received</th><th className="px-4 py-3 text-right font-medium">Returned</th><th className="px-4 py-3 text-right font-medium">Exchange credit</th><th className="px-4 py-3 text-right font-medium">Outstanding</th><th className="px-4 py-3 font-medium">Status</th></tr></thead>
            <tbody className="divide-y">{sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-medium"><Link href={`/sales/${sale.id}`} className="underline-offset-4 hover:underline">{sale.documentNo}</Link></td>
                <td className="px-4 py-3 text-muted-foreground">{sale.createdAt.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatPKR(sale.totalAmount)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatPKR(sale.totalReceived)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatPKR(sale.totalReturned)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatPKR(sale.exchangeCreditApplied)}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${Number(sale.outstandingAmount) > 0 && sale.status === "COMPLETED" ? "text-amber-700 dark:text-amber-300" : ""}`}>{formatPKR(sale.status === "COMPLETED" ? sale.outstandingAmount : "0.00")}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{sale.status}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </main>
  );
}
