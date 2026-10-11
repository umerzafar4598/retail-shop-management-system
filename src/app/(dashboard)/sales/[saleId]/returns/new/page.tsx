import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { hasPermission, requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { getSaleReturnScreenDataForShop } from "@/lib/pos/returns";
import SaleReturnForm from "./return-form";

const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPKR = (value: string | number) => `Rs ${moneyFormatter.format(Number(value))}`;

export default async function NewSaleReturnPage({ params }: { params: Promise<{ saleId: string }> }) {
  const shop = await requirePermission("products.view");
  const session = await requireSession();
  const canReturn = await hasPermission(session.user.id, shop.shopId, "products.update");
  const { saleId } = await params;
  const details = await getSaleReturnScreenDataForShop(shop.shopId, saleId);
  if (!details) notFound();
  if (details.sale.status !== "COMPLETED") redirect(`/sales/${saleId}`);
  const returnableItems = details.items.filter((item) => item.remainingQuantity > 0);

  return <main className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
    <div><Link href={`/sales/${saleId}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Back to sale receipt</Link><p className="mt-3 text-sm text-muted-foreground">Returns</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Return against {details.sale.documentNo}</h1><p className="mt-2 text-sm text-muted-foreground">Customer: {details.sale.customerName ?? "Walk-in"} · Original sale total {formatPKR(details.sale.totalAmount)}</p></div>
    {!canReturn ? <div className="rounded-lg border p-4 text-sm">You have view-only access. Ask an owner or manager with update permission to process a return.</div> : returnableItems.length === 0 ? <div className="rounded-lg border p-4"><p className="font-medium">No returnable quantities remain.</p><p className="mt-1 text-sm text-muted-foreground">Every quantity in this sale has already been returned.</p></div> : (Number(details.sale.exchangeCreditApplied) > 0 || details.history.returns.some((record) => Boolean(record.replacementSaleId))) ? <div className="rounded-lg border p-4 text-sm"><p className="font-medium">This sale participates in an exchange.</p><p className="mt-1 text-muted-foreground">Use the exchange workflow to avoid treating exchange credit as cash or refunding it twice.</p><Link href={`/sales/${saleId}/exchanges/new`} className="mt-3 inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Record exchange</Link></div> : <SaleReturnForm saleId={details.sale.id} documentNo={details.sale.documentNo} items={returnableItems} paymentAccounts={details.paymentAccounts} />}
    <section className="rounded-lg border p-4 text-sm"><h2 className="font-semibold">Return rules</h2><p className="mt-1 text-muted-foreground">Only goods marked RESTOCK increase sellable quantity and reverse cost of goods sold. DAMAGED and OTHER items are recorded in the return history but are not added to available stock. A return creates new ledger entries; the original sale and journal are never edited or deleted.</p></section>
  </main>;
}
