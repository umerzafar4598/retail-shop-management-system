import Link from "next/link";

import LogoutButton from "./logout-button";
import { hasPermission, requirePermission } from "@/lib/authorization";
import { getCurrentSession } from "@/lib/session";
import { listFinancialAccounts } from "@/lib/finance/financial-accounts";
import {
  getDefaultReportDateRange,
  getManagementReportForShop,
} from "@/lib/reports/management-reports";

function formatPKR(value: string | number) {
  return `Rs ${new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

type MetricCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  accent?: boolean;
};

function MetricCard({ label, value, detail, accent = false }: MetricCardProps) {
  const formatted = typeof value === "string" && /^-?\d+\.\d{2}$/.test(value)
    ? formatPKR(value)
    : value;

  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-sm ${accent ? "border-slate-400" : "border-slate-200"}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 wrap-break-word text-xl font-semibold tabular-nums text-slate-900">{formatted}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </article>
  );
}

type QuickLink = {
  href: string;
  label: string;
  description: string;
};

function QuickLinkCard({ href, label, description }: QuickLink) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{label}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <span aria-hidden="true" className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700">→</span>
      </div>
    </Link>
  );
}

const viewLinks: QuickLink[] = [
  { href: "/sales", label: "Sales history", description: "Review receipts, returns, and exchanges." },
  { href: "/inventory/products", label: "Product catalog", description: "Manage products, variants, and IMEI tracking." },
  { href: "/inventory/stock", label: "Stock overview", description: "Check stock quantities, values, and reorder alerts." },
  { href: "/purchases", label: "Purchases", description: "Review supplier purchases and payment status." },
  { href: "/settings/suppliers", label: "Suppliers", description: "Maintain supplier contact details." },
  { href: "/customers", label: "Customers", description: "Review customer profiles and outstanding balances." },
  { href: "/services", label: "Shop services", description: "Record and complete provider-service transactions." },
  { href: "/expenses", label: "Expenses", description: "Review posted expenses and corrections." },
  { href: "/cash-sessions", label: "Cash sessions", description: "Open, close, and reconcile each drawer." },
  { href: "/settings/finance/accounts", label: "Financial accounts", description: "Review cash, wallet, bank, and drawer balances." },
  { href: "/settings/finance/ledger", label: "Financial ledger", description: "Inspect posted journals and account movements." },
];

const reportLinks: QuickLink[] = [
  { href: "/reports", label: "Reports & analytics", description: "Owner-only revenue, profit, and financial reports." },
  { href: "/reports/inventory", label: "Inventory valuation", description: "Owner-only inventory valuation by product variant." },
];

const managementLinks: QuickLink[] = [
  { href: "/pos", label: "Open POS", description: "Start a retail checkout." },
  { href: "/settings/finance/transfers", label: "Account transfers", description: "Record real movements between shop accounts." },
  { href: "/settings/cash-drawers", label: "Cash drawer defaults", description: "Configure Retail and Services default drawers." },
  { href: "/settings/expenses", label: "Expense categories", description: "Map categories to expense ledger accounts." },
  { href: "/settings/services", label: "Service types", description: "Configure service types and default fees." },
  { href: "/settings/brands", label: "Brands", description: "Manage product brands." },
  { href: "/settings/categories", label: "Categories", description: "Manage product categories." },
  { href: "/settings/shop", label: "Shop settings", description: "Manage shop information and preferences." },
  { href: "/settings/staff", label: "Staff and roles", description: "Review staff access and role assignments." },
];

export default async function DashboardPage() {
  const context = await requirePermission("dashboard.view");
  const session = await getCurrentSession();

  const [canViewOperations, canManageOperations, canViewAudit, hasReportsPermission, canViewAccounts] = session
    ? await Promise.all([
      hasPermission(session.user.id, context.shopId, "products.view"),
      hasPermission(session.user.id, context.shopId, "products.update"),
      hasPermission(session.user.id, context.shopId, "audit.view"),
      hasPermission(session.user.id, context.shopId, "reports.view"),
      hasPermission(session.user.id, context.shopId, "financial_accounts.view"),
    ])
    : [false, false, false, false, false];

  // Never calculate/render aggregate report data for non-owners. The report
  // service independently enforces both the permission and Owner role.
  const canViewReports = hasReportsPermission && context.roleName.trim().toLocaleLowerCase("en-US") === "owner";
  const report = canViewReports
    ? await getManagementReportForShop(context.shopId, getDefaultReportDateRange())
    : null;
  // Managers/cashiers retain individual financial account balances without
  // receiving aggregate revenue, profit, receivables/payables, or valuation KPIs.
  const staffFinancialAccounts = !canViewReports && canViewAccounts
    ? await listFinancialAccounts()
    : [];

  const metrics = report?.metrics;
  const periodLabel = report
    ? `${formatDate(report.range.startDate)} – ${formatDate(report.range.endDate)}`
    : null;

  const linksToShow = [
    ...(canManageOperations ? managementLinks.filter((item) => item.href === "/pos" || item.href === "/settings/finance/transfers" || item.href === "/settings/cash-drawers" || item.href === "/settings/expenses" || item.href === "/settings/services" || item.href === "/settings/brands" || item.href === "/settings/categories" || item.href === "/settings/shop" || item.href === "/settings/staff") : []),
    ...(canViewOperations ? viewLinks : []),
    ...(canViewReports ? reportLinks : []),
    ...(canViewAudit ? [{ href: "/audit", label: "Audit history", description: "Review who changed business records and when." }] : []),
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Hamid Mobiles & Communications</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">{context.shopName}</h1>
            <p className="mt-1 text-sm text-slate-500">Management dashboard · PKR</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">{session?.user.name}</p>
              <p className="text-xs text-slate-500">{context.roleName}</p>
            </div>
            {canViewReports ? (
              <Link href="/reports" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">View reports</Link>
            ) : null}
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:py-10">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Overview</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Shop at a glance</h2>
          </div>
          {periodLabel ? <p className="text-sm text-slate-500">Financial activity: {periodLabel}</p> : null}
        </section>

        {metrics ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Financial performance">
              <MetricCard label="Net product sales" value={metrics.netProductSales} detail={`${metrics.salesCount} completed sales · after returns`} accent />
              <MetricCard label="Service fee revenue" value={metrics.serviceRevenue} detail={`${metrics.completedServicesCount} completed services`} />
              <MetricCard label="Gross profit" value={metrics.grossProfit} detail="Net product sales less recorded COGS" />
              <MetricCard label="Estimated operating profit" value={metrics.estimatedOperatingProfit} detail="Gross profit + service fees − operating expenses" accent />
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Current position and alerts">
              <MetricCard label="Customer receivables" value={metrics.accountsReceivable} detail="Current ledger balance · account 1300" />
              <MetricCard label="Supplier payables" value={metrics.accountsPayable} detail="Current ledger balance · account 2000" />
              <MetricCard label="Inventory value" value={metrics.inventoryValue} detail={`${metrics.inventoryUnits} units · ${metrics.inventoryVariantCount} variants`} />
              <MetricCard label="Cash discrepancies" value={metrics.cashDiscrepancyCount} detail={`${metrics.lowStockCount} low-stock · ${metrics.outOfStockCount} out-of-stock variants`} accent={metrics.cashDiscrepancyCount > 0 || metrics.lowStockCount > 0} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Current financial accounts</h2>
                    <p className="mt-1 text-sm text-slate-500">Balances from posted ledger entries; not limited to the selected month.</p>
                  </div>
                  <Link href="/settings/finance/accounts" className="text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-950">All accounts</Link>
                </div>
                {report.accountBalances.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No active financial accounts.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="pb-3 pr-3 font-medium">Account</th><th className="pb-3 pr-3 font-medium">Type</th><th className="pb-3 text-right font-medium">Balance</th></tr></thead>
                      <tbody>
                        {report.accountBalances.slice(0, 7).map((account) => (
                          <tr key={account.id} className="border-b last:border-0">
                            <td className="py-3 pr-3"><p className="font-medium text-slate-800">{account.name}</p><p className="text-xs text-slate-500">{account.provider} · ledger {account.ledger_code}</p></td>
                            <td className="py-3 pr-3 text-slate-500">{account.kind.replaceAll("_", " ")}</td>
                            <td className={`py-3 text-right font-medium tabular-nums ${Number(account.balance) < 0 ? "text-amber-700" : "text-slate-900"}`}>{formatPKR(account.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <Link href="/settings/finance/ledger" className="font-medium text-slate-700 underline underline-offset-4">Open financial ledger</Link>
                  <Link href="/cash-sessions" className="font-medium text-slate-700 underline underline-offset-4">Reconcile cash drawers</Link>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Activity this period</h2>
                <p className="mt-1 text-sm text-slate-500">Counts based on posted or completed documents.</p>
                <dl className="mt-4 divide-y divide-slate-100">
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="text-sm text-slate-600">Completed sales</dt><dd className="font-semibold tabular-nums text-slate-900">{metrics.salesCount}</dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="text-sm text-slate-600">Completed services</dt><dd className="font-semibold tabular-nums text-slate-900">{metrics.completedServicesCount}</dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="text-sm text-slate-600">Returns completed</dt><dd className="font-semibold tabular-nums text-slate-900">{metrics.returnsCount}</dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="text-sm text-slate-600">Purchases posted</dt><dd className="font-semibold tabular-nums text-slate-900">{metrics.postedPurchasesCount}</dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="text-sm text-slate-600">Expenses posted</dt><dd className="font-semibold tabular-nums text-slate-900">{metrics.postedExpensesCount}</dd></div>
                </dl>
                <Link href="/reports" className="mt-4 inline-flex text-sm font-medium text-slate-700 underline underline-offset-4">Explore reports & analytics</Link>
              </article>
            </section>
          </>
        ) : (
          <div className="space-y-4">
            {context.roleName === "Owner" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Current financial accounts</h2>
                    <p className="mt-1 text-sm text-slate-500">Individual account balances from posted ledger entries. Aggregate revenue, profit, receivables/payables, and financial reports are owner-only.</p>
                  </div>
                  <Link href="/settings/finance/accounts" className="text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-950">All accounts</Link>
                </div>
                {staffFinancialAccounts.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No financial accounts available.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="pb-3 pr-3 font-medium">Account</th><th className="pb-3 pr-3 font-medium">Type</th><th className="pb-3 text-right font-medium">Balance</th></tr></thead>
                      <tbody>
                        {staffFinancialAccounts.filter((account) => account.isActive).map((account) => (
                          <tr key={account.id} className="border-b last:border-0">
                            <td className="py-3 pr-3"><p className="font-medium text-slate-800">{account.name}</p><p className="text-xs text-slate-500">{account.provider}</p></td>
                            <td className="py-3 pr-3 text-slate-500">{account.kind.replaceAll("_", " ")}</td>
                            <td className={`py-3 text-right font-medium tabular-nums ${Number(account.balance) < 0 ? "text-amber-700" : "text-slate-900"}`}>{formatPKR(account.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <Link href="/settings/finance/ledger" className="font-medium text-slate-700 underline underline-offset-4">Open financial ledger</Link>
                  <Link href="/cash-sessions" className="font-medium text-slate-700 underline underline-offset-4">Reconcile cash drawers</Link>
                </div>
              </section>
            ) : null}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Your shop workspace</h2>
              <p className="mt-2 text-sm text-slate-600">You are signed in to {context.shopName} as {context.roleName}. Individual transactions and account balances remain available where permitted; aggregate revenue, profit, and financial reports are restricted to the Owner role.</p>
            </section>
          </div>
        )}

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Quick access</h2>
            <p className="mt-1 text-sm text-slate-500">Open the workflows you use to run the shop. Each page enforces its own permissions.</p>
          </div>
          {linksToShow.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No operational links are available for your current permissions.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {linksToShow.map((item) => <QuickLinkCard key={item.href} {...item} />)}
            </div>
          )}
        </section>

        <p className="text-xs leading-5 text-slate-500">{canViewReports ? "Reports are read-only and derived from recorded transactions. Financial performance reflects the displayed period; account balances, receivables, payables, and inventory valuation are current snapshots. Estimated operating profit is a management KPI, not a formal financial statement." : "Individual transactions and permitted account balances are sourced from posted records. Aggregate revenue, profit, and financial reports are restricted to the Owner role."}</p>
      </div>
    </main>
  );
}
