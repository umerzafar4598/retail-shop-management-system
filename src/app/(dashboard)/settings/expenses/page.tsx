import Link from "next/link";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { getExpenseCategorySettingsForShop } from "@/lib/expenses/expenses";
import ExpenseCategoryForm from "./expense-category-form";
import ExpenseCategoryRow from "./expense-category-row";

export default async function ExpenseSettingsPage() {
  const shop = await requirePermission("products.update");
  const session = await requireSession();
  const data = await getExpenseCategorySettingsForShop(shop.shopId, session.user.id);
  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">Settings / Finance</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Expense Categories</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Categories map expense records to specific leaf expense ledger accounts. Deactivation affects new expenses only; posted history stays intact.</p></div><Link href="/expenses" className="text-sm underline underline-offset-4">Back to expenses</Link></header>
      <ExpenseCategoryForm accounts={data.ledgerOptions} />
      <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Configured categories</h2><p className="mt-1 text-sm text-muted-foreground">Default categories are created when their corresponding chart-of-accounts expense code exists.</p></div>{data.categories.length === 0 ? <div className="p-8 text-sm text-muted-foreground">No expense categories are configured. Ensure the chart of accounts has an active expense ledger account, then create a category.</div> : data.categories.map((category) => <ExpenseCategoryRow key={category.id} category={category} />)}</section>
    </main>
  );
}
