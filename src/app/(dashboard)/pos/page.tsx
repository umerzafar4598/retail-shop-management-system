import Link from "next/link";

import { requirePermission } from "@/lib/authorization";
import { getPosScreenDataForShop } from "@/lib/pos/checkout";
import PosCheckoutForm from "./pos-checkout-form";

export default async function PosPage() {
  const shop = await requirePermission("products.update");
  const data = await getPosScreenDataForShop(shop.shopId);
  const inStockVariantCount = data.catalog.filter((item) => item.stockQuantity > 0).length;

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Sales / Checkout</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Point of Sale</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Search products, select a customer when needed, allocate the money received, and complete fully paid or credit sales.
            Checkout validates stock and posts receivables, payments, inventory movements, and the balanced ledger journal together.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/customers" className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted">Customers</Link>
          <Link href="/sales" className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted">Sales history</Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active variants</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{data.catalog.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Variants with stock</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{inStockVariantCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">IMEI devices available</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{data.devices.length}</p>
        </div>
      </section>

      {data.catalog.length === 0 ? (
        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">No active products available</h2>
          <p className="mt-2 text-sm text-muted-foreground">Create an active product variant before using the POS.</p>
          <Link className="mt-3 inline-flex text-sm font-medium underline underline-offset-4" href="/inventory/products">Open product catalog</Link>
        </section>
      ) : (
        <>
          {data.paymentAccounts.length === 0 ? (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              No active receiving account is available. Only customer-credit sales can be completed until an eligible financial account is configured.
              <Link className="ml-1 font-medium underline underline-offset-4" href="/settings/finance/accounts">Configure financial accounts</Link>
            </section>
          ) : null}
          <PosCheckoutForm catalog={data.catalog} devices={data.devices} paymentAccounts={data.paymentAccounts} customers={data.customers} />
        </>
      )}
    </main>
  );
}
