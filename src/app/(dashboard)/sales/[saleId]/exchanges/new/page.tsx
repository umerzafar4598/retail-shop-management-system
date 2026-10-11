import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { hasPermission, requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { getSaleExchangeScreenDataForShop } from "@/lib/pos/exchanges";
import SaleExchangeForm from "./exchange-form";

const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPKR = (value: string | number) => `Rs ${moneyFormatter.format(Number(value))}`;

export default async function NewSaleExchangePage({ params }: { params: Promise<{ saleId: string }> }) {
  const shop = await requirePermission("products.view");
  const session = await requireSession();
  const canExchange = await hasPermission(session.user.id, shop.shopId, "products.update");
  const { saleId } = await params;
  const details = await getSaleExchangeScreenDataForShop(shop.shopId, saleId);
  if (!details) notFound();
  if (details.original.sale.status !== "COMPLETED") redirect(`/sales/${saleId}`);
  const { original, returnableItems, catalog, devices, paymentAccounts, customers } = details;

  return <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
    <div><Link href={`/sales/${saleId}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Back to original receipt</Link><p className="mt-3 text-sm text-muted-foreground">Sales · Exchanges</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Exchange against {original.sale.documentNo}</h1><p className="mt-2 text-sm text-muted-foreground">Customer: {original.sale.customerName ?? "Walk-in"} · Original sale total {formatPKR(original.sale.totalAmount)}</p></div>
    {!canExchange ? <div className="rounded-lg border p-4 text-sm">You have view-only access. Ask an owner or manager with update permission to process an exchange.</div>
      : returnableItems.length === 0 ? <div className="rounded-lg border p-4"><p className="font-medium">No returnable quantities remain.</p><p className="mt-1 text-sm text-muted-foreground">Every item quantity from this sale has already been returned.</p></div>
      : <SaleExchangeForm originalSaleId={original.sale.id} documentNo={original.sale.documentNo} customerId={original.sale.customerId} items={returnableItems} catalog={catalog} devices={devices} paymentAccounts={paymentAccounts} customers={customers} />}
    <section className="rounded-lg border p-4 text-sm"><h2 className="font-semibold">Exchange rules</h2><p className="mt-1 text-muted-foreground">An exchange records a return and a replacement sale in one database transaction. The original sale must have no outstanding balance. The replacement total must be equal to or greater than the returned value; a lower-priced replacement should be handled as a normal return/refund followed by a separate sale. Any outstanding difference must be assigned to the same customer or another selected customer only when the original sale was walk-in.</p></section>
  </main>;
}
