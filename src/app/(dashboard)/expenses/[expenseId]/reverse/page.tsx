import Link from "next/link";
import { notFound } from "next/navigation";

import { hasPermission, requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { getExpenseForReversalPageData, getExpensePageData } from "@/lib/expenses/expenses";
import ExpenseReversalForm from "./expense-reversal-form";

const money = (value: string | number) => `Rs ${new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
function getPakistanToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function ExpenseReversalPage({ params }: { params: Promise<{ expenseId: string }> }) {
  const shop = await requirePermission("products.view");
  const session = await requireSession();
  const { expenseId } = await params;
  const [data, settings, canManage] = await Promise.all([
    getExpenseForReversalPageData(shop.shopId, expenseId),
    getExpensePageData(shop.shopId),
    hasPermission(session.user.id, shop.shopId, "products.update"),
  ]);
  if (!data) notFound();
  const { expense, reversal } = data;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Finance / Expenses / Correction history</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{expense.documentNo}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Review the original record before reversing or correcting it.</p>
        </div>
        <Link href="/expenses" className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium">Back to expenses</Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Expense</p>
          <p className="mt-2 text-xl font-semibold">{expense.categoryName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{expense.expenseDate} · {expense.accountName}</p>
          {expense.payee ? <p className="mt-1 text-sm text-muted-foreground">Payee: {expense.payee}</p> : null}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Amount / status</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{money(expense.amount)}</p>
          <p className="mt-1 text-sm">{expense.status}</p>
        </div>
      </section>

      {expense.notes ? <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Original notes</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{expense.notes}</p></section> : null}

      {expense.status === "POSTED" ? (
        canManage ? (
          <ExpenseReversalForm
            expenseId={expense.id}
            documentNo={expense.documentNo}
            amount={expense.amount}
            categoryId={expense.categoryId}
            financialAccountId={expense.financialAccountId}
            expenseDate={expense.expenseDate}
            payee={expense.payee}
            notes={expense.notes}
            categories={settings.categories.map(({ id, name }) => ({ id, name }))}
            accounts={settings.accounts.map(({ id, name }) => ({ id, name }))}
            today={getPakistanToday()}
          />
        ) : (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">You can view this expense but do not have permission to reverse it.</p>
        )
      ) : (
        <section className="space-y-2 rounded-xl border border-amber-400/50 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <h2 className="font-semibold">This expense is already reversed or voided</h2>
          <p className="text-sm">Original status: {expense.status}. No additional reversal can be posted against it.</p>
          {reversal?.reversalDocumentNo ? <p className="text-sm">Reversal document: <strong>{reversal.reversalDocumentNo}</strong></p> : null}
          {reversal?.replacementDocumentNo ? <p className="text-sm">Corrected replacement: <strong>{reversal.replacementDocumentNo}</strong></p> : null}
          {reversal?.reason ? <p className="text-sm">Reason: {reversal.reason}</p> : null}
          {reversal?.reversedAt ? <p className="text-xs">Reversed {reversal.reversedAt.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}</p> : null}
          {reversal?.replacementAdvice ? <p className="text-sm">{reversal.replacementAdvice}</p> : <p className="text-sm">No reversal details were found in the audit log. Review the ledger and audit history before taking further action.</p>}
        </section>
      )}
    </main>
  );
}
