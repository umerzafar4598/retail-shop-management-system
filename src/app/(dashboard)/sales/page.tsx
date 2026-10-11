import Link from "next/link";

import { requirePermission } from "@/lib/authorization";
import { listRecentSalesForShop } from "@/lib/pos/checkout";

const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPKR = (value: string | number) => `Rs ${moneyFormatter.format(Number(value))}`;

export default async function SalesHistoryPage() {
  const shop = await requirePermission("products.view");
  const recentSales = await listRecentSalesForShop(shop.shopId);

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Sales</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sales history</h1>
          <p className="mt-2 text-sm text-muted-foreground">Completed sale documents and receipts. Posted sales should be corrected through the dedicated returns/reversal workflow, not by editing their rows.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/customers" className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted">Customers</Link>
          <Link href="/pos" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Open POS</Link>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-4 md:px-5">
          <h2 className="font-semibold">Latest 100 sales</h2>
        </div>
        {recentSales.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium">No sales recorded yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Completed sales from the POS will appear here.</p>
            <Link href="/pos" className="mt-4 inline-flex text-sm font-medium underline underline-offset-4">Start a sale</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Sale document</th>
                  <th className="px-4 py-3 font-medium">Date / time</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 text-right font-medium">Subtotal</th>
                  <th className="px-4 py-3 text-right font-medium">Discount</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Received</th>
                  <th className="px-4 py-3 text-right font-medium">Outstanding</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium"><Link href={`/sales/${sale.id}`} className="underline-offset-4 hover:underline">{sale.documentNo}</Link></td>
                    <td className="px-4 py-3 text-muted-foreground">{sale.createdAt.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}</td>
                    <td className="px-4 py-3">{sale.customerName ?? "Walk-in"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatPKR(sale.subtotal)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatPKR(sale.discountAmount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{formatPKR(sale.totalAmount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatPKR(sale.totalReceived)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${sale.status === "COMPLETED" && Number(sale.totalAmount) > Number(sale.totalReceived) + Number(sale.totalReturned) + Number(sale.exchangeCreditApplied) ? "text-amber-700 dark:text-amber-300" : ""}`}>{formatPKR(sale.status === "COMPLETED" ? Math.max(0, Number(sale.totalAmount) - Number(sale.totalReceived) - Number(sale.totalReturned) - Number(sale.exchangeCreditApplied)).toFixed(2) : "0.00")}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${sale.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{sale.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
