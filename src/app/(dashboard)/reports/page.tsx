import Link from "next/link";

import { requireOwnerFinancialReportAccess } from "@/lib/authorization/owner-financial-reports";
import {
  getManagementReportForShop,
  normalizeReportDateRange,
} from "@/lib/reports/management-reports";

const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatPKR(value: string | number) { return `Rs ${moneyFormatter.format(Number(value ?? 0))}`; }
function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function MetricCard({ label, value, detail, accent = false }: { label: string; value: string | number; detail?: string; accent?: boolean }) {
  return <div className={`rounded-xl border bg-card p-4 ${accent ? "border-primary/40" : ""}`}>
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-2 text-xl font-semibold tabular-nums">{typeof value === "string" && value.includes(".") ? formatPKR(value) : value}</p>
    {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
  </div>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const shop = await requireOwnerFinancialReportAccess();
  const requested = await searchParams;
  const normalized = normalizeReportDateRange(requested.start, requested.end);
  const data = await getManagementReportForShop(shop.shopId, normalized.range);
  const metrics = data.metrics;

  return <main className="space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground">Management / Analytics</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reports & Analytics</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Read-only management reports derived from posted ledger, sales, inventory, service, purchase, expense, and cash-session records.</p>
      </div>
      <Link href="/reports/inventory" className="inline-flex rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">Inventory valuation report →</Link>
    </header>

    <section className="rounded-xl border bg-card p-4">
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm"><span className="text-muted-foreground">From</span><input className="h-10 rounded-md border bg-background px-3" type="date" name="start" required defaultValue={data.range.startDate} /></label>
        <label className="grid gap-1 text-sm"><span className="text-muted-foreground">To</span><input className="h-10 rounded-md border bg-background px-3" type="date" name="end" required defaultValue={data.range.endDate} /></label>
        <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">Apply dates</button>
        <Link className="h-10 inline-flex items-center px-2 text-sm underline underline-offset-4" href="/reports">Current month</Link>
      </form>
      {normalized.warning ? <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{normalized.warning}</p> : null}
      <p className="mt-3 text-xs text-muted-foreground">Period: {formatDate(data.range.startDate)} – {formatDate(data.range.endDate)} · Daily boundaries use Asia/Karachi. Current balances are as of now and do not change with this date filter.</p>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Net product sales" value={metrics.netProductSales} detail={`${metrics.salesCount} completed sales · after recorded returns`} accent />
      <MetricCard label="Service fee revenue" value={metrics.serviceRevenue} detail={`${metrics.completedServicesCount} completed services`} />
      <MetricCard label="Gross profit" value={metrics.grossProfit} detail="Net product sales less recorded COGS" />
      <MetricCard label="Estimated operating profit" value={metrics.estimatedOperatingProfit} detail="Gross profit + service fees − operating expenses" accent />
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Current customer receivables" value={metrics.accountsReceivable} detail="Ledger account 1300" />
      <MetricCard label="Current supplier payables" value={metrics.accountsPayable} detail="Ledger account 2000" />
      <MetricCard label="Current inventory value" value={metrics.inventoryValue} detail={`${metrics.inventoryUnits} units across ${metrics.inventoryVariantCount} variants`} />
      <MetricCard label="Cash discrepancies to review" value={metrics.cashDiscrepancyCount} detail={`${metrics.lowStockCount} low-stock · ${metrics.outOfStockCount} out-of-stock variants`} />
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
      <article className="rounded-xl border bg-card p-5">
        <div className="mb-4"><h2 className="text-lg font-semibold">Income summary</h2><p className="mt-1 text-sm text-muted-foreground">Posted ledger activity during the selected period. Reversals reduce the corresponding account totals.</p></div>
        <div className="divide-y">
          <div className="flex justify-between gap-4 py-3 text-sm"><span>Product sales revenue</span><span className="font-medium tabular-nums">{formatPKR(metrics.productSales)}</span></div>
          <div className="flex justify-between gap-4 py-3 text-sm"><span>Less: sales returns / discounts</span><span className="font-medium tabular-nums">− {formatPKR(metrics.salesReturns)}</span></div>
          <div className="flex justify-between gap-4 py-3 text-sm font-semibold"><span>Net product sales</span><span className="tabular-nums">{formatPKR(metrics.netProductSales)}</span></div>
          <div className="flex justify-between gap-4 py-3 text-sm"><span>Cost of goods sold (net)</span><span className="font-medium tabular-nums">− {formatPKR(metrics.cogs)}</span></div>
          <div className="flex justify-between gap-4 py-3 text-sm font-semibold"><span>Gross profit</span><span className="tabular-nums">{formatPKR(metrics.grossProfit)}</span></div>
          <div className="flex justify-between gap-4 py-3 text-sm"><span>Service fee revenue</span><span className="font-medium tabular-nums">+ {formatPKR(metrics.serviceRevenue)}</span></div>
          <div className="flex justify-between gap-4 py-3 text-sm"><span>Operating expenses (excludes COGS)</span><span className="font-medium tabular-nums">− {formatPKR(metrics.operatingExpenses)}</span></div>
          <div className="flex justify-between gap-4 border-t py-4 text-base font-semibold"><span>Estimated operating profit</span><span className="tabular-nums">{formatPKR(metrics.estimatedOperatingProfit)}</span></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">This management estimate excludes taxes, financing costs, owner drawings/capital, and any accounts not posted through the ledger. It is not a substitute for a formally reviewed financial statement.</p>
      </article>

      <article className="rounded-xl border bg-card p-5">
        <div className="mb-4"><h2 className="text-lg font-semibold">Activity by day</h2><p className="mt-1 text-sm text-muted-foreground">Ledger-posted product sales, returns, and service fees.</p></div>
        <div className="max-h-[470px] space-y-4 overflow-auto pr-1">
          {data.dailyActivity.map((day) => {
            const productValue = Math.max(0, Number(day.productSales));
            const servicesValue = Math.max(0, Number(day.serviceRevenue));
            const max = Math.max(1, ...data.dailyActivity.map((item) => Math.max(Number(item.productSales), Number(item.serviceRevenue))));
            return <div key={day.date} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm"><span>{formatDate(day.date)}</span><span className="text-muted-foreground">Returns {formatPKR(day.salesReturns)}</span></div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2"><span className="w-16 text-xs text-muted-foreground">Products</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(productValue > 0 ? 1 : 0, Math.min(100, productValue / max * 100))}%` }} /></div><span className="w-28 text-right text-xs tabular-nums">{formatPKR(day.productSales)}</span></div>
                <div className="flex items-center gap-2"><span className="w-16 text-xs text-muted-foreground">Services</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(servicesValue > 0 ? 1 : 0, Math.min(100, servicesValue / max * 100))}%` }} /></div><span className="w-28 text-right text-xs tabular-nums">{formatPKR(day.serviceRevenue)}</span></div>
              </div>
            </div>;
          })}
        </div>
      </article>
    </section>

    <section className="grid gap-4 xl:grid-cols-2">
      <article className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Current financial accounts</h2><p className="mt-1 text-sm text-muted-foreground">Balances as of now, calculated from posted ledger entries.</p>
        {data.accountBalances.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No active financial accounts.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-3 font-medium">Account</th><th className="pb-2 pr-3 font-medium">Kind</th><th className="pb-2 text-right font-medium">Balance</th></tr></thead><tbody>{data.accountBalances.map((account) => <tr key={account.id} className="border-b last:border-0"><td className="py-3 pr-3"><div className="font-medium">{account.name}</div><div className="text-xs text-muted-foreground">{account.provider} · Ledger {account.ledger_code}</div></td><td className="py-3 pr-3 text-muted-foreground">{account.kind.replaceAll("_", " ")}</td><td className={`py-3 text-right font-medium tabular-nums ${Number(account.balance) < 0 ? "text-amber-700 dark:text-amber-300" : ""}`}>{formatPKR(account.balance)}</td></tr>)}</tbody></table></div>}
      </article>
      <article className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Operating expense breakdown</h2><p className="mt-1 text-sm text-muted-foreground">Net expense-ledger movements during the selected period, including reversals.</p>
        {data.expenseBreakdown.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No operating expenses posted in this period.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-3 font-medium">Ledger account</th><th className="pb-2 pr-3 font-medium">Code</th><th className="pb-2 text-right font-medium">Net expense</th></tr></thead><tbody>{data.expenseBreakdown.map((expense) => <tr key={expense.code} className="border-b last:border-0"><td className="py-3 pr-3 font-medium">{expense.name}</td><td className="py-3 pr-3 text-muted-foreground">{expense.code}</td><td className="py-3 text-right tabular-nums">{formatPKR(expense.amount)}</td></tr>)}</tbody></table></div>}
      </article>
    </section>

    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">Operational activity</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-muted/40 p-3"><p className="text-sm text-muted-foreground">Posted purchases</p><p className="mt-1 text-xl font-semibold">{metrics.postedPurchasesCount}</p></div>
        <div className="rounded-lg bg-muted/40 p-3"><p className="text-sm text-muted-foreground">Completed returns</p><p className="mt-1 text-xl font-semibold">{metrics.returnsCount}</p></div>
        <div className="rounded-lg bg-muted/40 p-3"><p className="text-sm text-muted-foreground">Posted expenses</p><p className="mt-1 text-xl font-semibold">{metrics.postedExpensesCount}</p></div>
        <div className="rounded-lg bg-muted/40 p-3"><p className="text-sm text-muted-foreground">Inventory variants</p><p className="mt-1 text-xl font-semibold">{metrics.inventoryVariantCount}</p></div>
      </div>
    </section>
  </main>;
}
