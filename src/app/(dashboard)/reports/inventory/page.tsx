import Link from "next/link";

import { requireOwnerFinancialReportAccess } from "@/lib/authorization/owner-financial-reports";
import { getInventoryReportForShop } from "@/lib/reports/management-reports";

const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatPKR(value: string | number) { return `Rs ${moneyFormatter.format(Number(value ?? 0))}`; }

export default async function InventoryReportPage() {
  const shop = await requireOwnerFinancialReportAccess();
  const rows = await getInventoryReportForShop(shop.shopId);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.inventoryValue), 0);
  const totalUnits = rows.reduce((sum, row) => sum + row.quantity, 0);
  const lowStock = rows.filter((row) => row.quantity > 0 && row.quantity <= row.reorder_level).length;
  const outOfStock = rows.filter((row) => row.quantity <= 0).length;

  return <main className="space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm text-muted-foreground">Reports / Inventory</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Inventory Valuation</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Current stock value by sellable variant. Quantity-based products use weighted-average cost; IMEI-tracked devices use their individual in-stock purchase costs.</p></div>
      <Link href="/reports" className="inline-flex rounded-lg border px-3 py-2 text-sm hover:bg-muted">← Reports overview</Link>
    </header>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Inventory value</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatPKR(totalValue)}</p></div>
      <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Current units</p><p className="mt-2 text-xl font-semibold">{totalUnits}</p></div>
      <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Low stock variants</p><p className="mt-2 text-xl font-semibold">{lowStock}</p></div>
      <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Out of stock variants</p><p className="mt-2 text-xl font-semibold">{outOfStock}</p></div>
    </section>
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b p-4"><h2 className="font-semibold">Stock value details</h2><p className="mt-1 text-sm text-muted-foreground">Includes inactive catalog variants that still hold stock, so their value isn't hidden.</p></div>
      {rows.length === 0 ? <div className="p-10 text-center"><h3 className="font-medium">No inventory balances found</h3><p className="mt-2 text-sm text-muted-foreground">Create a product variant and post a purchase or opening stock operation to begin inventory valuation.</p></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40"><tr className="text-left"><th className="px-4 py-3 font-medium">Product / Variant</th><th className="px-4 py-3 font-medium">SKU</th><th className="px-4 py-3 text-right font-medium">Quantity</th><th className="px-4 py-3 text-right font-medium">Cost method</th><th className="px-4 py-3 text-right font-medium">Stock value</th><th className="px-4 py-3 font-medium">Status</th></tr></thead><tbody>{rows.map((row) => {
        const status = row.quantity <= 0 ? "OUT OF STOCK" : row.quantity <= row.reorder_level ? "LOW STOCK" : "IN STOCK";
        return <tr key={row.variant_id} className="border-t">
          <td className="px-4 py-3"><div className="font-medium">{row.product_name}</div><div className="text-xs text-muted-foreground">{row.variant_name}{row.active ? "" : " · Inactive catalog item"}</div></td>
          <td className="px-4 py-3 text-muted-foreground">{row.sku}</td>
          <td className="px-4 py-3 text-right tabular-nums">{row.quantity}</td>
          <td className="px-4 py-3 text-right text-muted-foreground">{row.track_by_imei ? "IMEI cost" : "Weighted average"}</td>
          <td className="px-4 py-3 text-right font-medium tabular-nums">{formatPKR(row.inventoryValue)}</td>
          <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${status === "IN STOCK" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : status === "LOW STOCK" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>{status}</span></td>
        </tr>;
      })}</tbody><tfoot className="border-t bg-muted/30"><tr><td colSpan={2} className="px-4 py-3 font-semibold">Total</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{totalUnits}</td><td /><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPKR(totalValue)}</td><td /></tr></tfoot></table></div>}
    </section>
  </main>;
}
