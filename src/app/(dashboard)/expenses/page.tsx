import Link from "next/link";

import { hasPermission, requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { getExpensePageData } from "@/lib/expenses/expenses";
import ExpenseCreateForm from "./expense-create-form";

const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatPKR(value: string | number) { return `Rs ${moneyFormatter.format(Number(value))}`; }
function getPakistanToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function ExpensesPage() {
  const shop = await requirePermission("expenses.view");
  const session = await requireSession();
  const [data, canManage] = await Promise.all([
    getExpensePageData(shop.shopId),
    hasPermission(session.user.id, shop.shopId, "expenses.create"),
  ]);
  const recentTotal = data.recentExpenses
    .filter((expense) => expense.status === "POSTED")
    .reduce((sum, expense) => sum + Number(expense.amount), 0);

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Finance / Operating costs</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Record money actually paid from a shop account. Posted expenses are never silently edited or deleted; use a reasoned reversal and, when needed, a corrected replacement document.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/settings/expenses" className="underline underline-offset-4">Expense categories</Link>
          <Link href="/settings/cash-drawers" className="underline underline-offset-4">Cash drawer defaults</Link>
          <Link href="/cash-sessions" className="underline underline-offset-4">Cash sessions</Link>
          <Link href="/settings/finance/ledger" className="underline underline-offset-4">Finance ledger</Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Expenses this month</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatPKR(data.monthTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Posted expenses only, based on expense dates.</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Recent posted total</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatPKR(recentTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Sum of currently displayed posted records.</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Active categories</p>
          <p className="mt-2 text-2xl font-semibold">{data.categories.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Each category maps to a ledger expense account.</p>
        </div>
      </section>

      {canManage ? <ExpenseCreateForm categories={data.categories.map(({ id, name }) => ({ id, name }))} accounts={data.accounts.map(({ id, name }) => ({ id, name }))} defaultFinancialAccountId={data.defaultRetailCashDrawerId} today={getPakistanToday()} /> : null}

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-4 md:p-5">
          <h2 className="font-semibold">Recent expenses</h2>
          <p className="mt-1 text-sm text-muted-foreground">Latest 50 expense documents, including reversed records. Corrections preserve the original expense and journal history.</p>
        </div>
        {data.recentExpenses.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="font-medium">No expenses recorded yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">Record an expense after configuring an active category and payment account.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Payee / Notes</th>
                  <th className="px-4 py-3">Paid from</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">History</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.recentExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-muted/30">
                    <td className="px-4 py-4 font-medium">{expense.documentNo}</td>
                    <td className="whitespace-nowrap px-4 py-4">{expense.expenseDate}</td>
                    <td className="px-4 py-4">{expense.categoryName}</td>
                    <td className="px-4 py-4">{expense.payee ?? "—"}{expense.notes ? <p className="mt-1 max-w-sm text-xs text-muted-foreground">{expense.notes}</p> : null}</td>
                    <td className="px-4 py-4">{expense.accountName}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-medium tabular-nums">{formatPKR(expense.amount)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${expense.status === "POSTED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                        {expense.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {canManage || expense.status === "VOIDED" ? (
                        <Link href={`/expenses/${expense.id}/reverse`} className="font-medium underline underline-offset-4">
                          {expense.status === "POSTED" ? "Reverse / correct" : "View reversal"}
                        </Link>
                      ) : "—"}
                    </td>
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
