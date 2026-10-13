import Link from "next/link";

import { hasPermission, requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { getCashSessionPageData } from "@/lib/cash/cash-sessions";
import { AcknowledgeCashDiscrepancyForm, CloseCashSessionForm, OpenCashSessionForm } from "./cash-session-forms";

const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatPKR(value: string | number | null | undefined) { return `Rs ${moneyFormatter.format(Number(value ?? 0))}`; }
function statusClass(status: string) {
  if (status === "OPEN") return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
  if (status === "RECONCILIATION_REQUIRED") return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
}
function dateTime(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function CashSessionsPage() {
  const shop = await requirePermission("cash_sessions.view");
  const session = await requireSession();
  const [data, canOpen, canClose, canReconcile, canViewExpenses, canManageDrawerDefaults, canViewAccounts] = await Promise.all([
    getCashSessionPageData(shop.shopId),
    hasPermission(session.user.id, shop.shopId, "cash_sessions.open"),
    hasPermission(session.user.id, shop.shopId, "cash_sessions.close"),
    hasPermission(session.user.id, shop.shopId, "cash_sessions.reconcile"),
    hasPermission(session.user.id, shop.shopId, "expenses.view"),
    hasPermission(session.user.id, shop.shopId, "cash_drawers.manage"),
    hasPermission(session.user.id, shop.shopId, "financial_accounts.view"),
  ]);
  const openCount = data.sessions.filter((item) => item.status === "OPEN").length;
  const reconcileCount = data.sessions.filter((item) => item.status === "RECONCILIATION_REQUIRED").length;

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Finance / Cash control</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cash Sessions</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Record opening cash, compare expected cash movement to the physical count, and retain any discrepancy for review. Cash session operations do not themselves post accounting adjustments.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">{canViewExpenses ? <Link className="underline underline-offset-4" href="/expenses">Expenses</Link> : null}{canManageDrawerDefaults ? <Link className="underline underline-offset-4" href="/settings/cash-drawers">Drawer defaults</Link> : null}{canViewAccounts ? <Link className="underline underline-offset-4" href="/settings/finance/accounts">Financial accounts</Link> : null}</div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Recent sessions</p><p className="mt-2 text-2xl font-semibold">{data.sessions.length}</p></div>
        <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Open sessions</p><p className="mt-2 text-2xl font-semibold">{openCount}</p></div>
        <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Need discrepancy review</p><p className="mt-2 text-2xl font-semibold">{reconcileCount}</p></div>
      </section>

      {canOpen ? <OpenCashSessionForm accounts={data.availableAccounts} /> : null}

      <section className="space-y-4">
        <div><h2 className="text-lg font-semibold">Session history</h2><p className="mt-1 text-sm text-muted-foreground">Latest 50 sessions for this shop.</p></div>
        {data.sessions.length === 0 ? <div className="rounded-xl border p-10 text-center"><h3 className="font-medium">No cash sessions yet</h3><p className="mt-2 text-sm text-muted-foreground">Open a cash session to begin tracking a drawer’s physical count against recorded money movements.</p></div> : data.sessions.map((item) => (
          <article key={item.id} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold">{item.accountName}</h3><p className="mt-1 text-xs text-muted-foreground">Session {item.id}</p><p className="mt-1 text-sm text-muted-foreground">Opened {dateTime(item.openedAt)}</p></div>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(item.status)}`}>{item.status.replaceAll("_", " ")}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Opening physical cash</p><p className="mt-1 font-semibold tabular-nums">{formatPKR(item.openingAmount)}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Opening ledger baseline</p><p className="mt-1 font-semibold tabular-nums">{formatPKR(item.openingLedgerBalance)}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Expected / actual close</p><p className="mt-1 font-semibold tabular-nums">{item.expectedClosingAmount === null ? "Not closed" : `${formatPKR(item.expectedClosingAmount)} / ${formatPKR(item.actualClosingAmount)}`}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Difference (actual − expected)</p><p className={`mt-1 font-semibold tabular-nums ${Number(item.difference ?? 0) === 0 ? "" : "text-amber-700 dark:text-amber-300"}`}>{item.difference === null ? "Not closed" : formatPKR(item.difference)}</p></div>
            </div>
            {canClose && item.status === "OPEN" ? <CloseCashSessionForm cashSessionId={item.id} /> : null}
            {canReconcile && item.status === "RECONCILIATION_REQUIRED" ? <AcknowledgeCashDiscrepancyForm cashSessionId={item.id} /> : null}
            {item.status === "CLOSED" && item.closedAt ? <p className="mt-3 text-xs text-muted-foreground">Closed {dateTime(item.closedAt)}. Any recorded difference remains preserved in the session history.</p> : null}
          </article>
        ))}
      </section>
    </main>
  );
}
