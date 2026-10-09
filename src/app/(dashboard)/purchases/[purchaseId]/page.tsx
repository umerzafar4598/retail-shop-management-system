import Link from "next/link";
import { notFound } from "next/navigation";

import { hasPermission, requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { getPurchaseReceivingDetailsForShop } from "@/lib/purchases/purchase-receiving";
import Decimal from "decimal.js";
import SupplierPaymentForm from "../supplier-payment-form";
import ReceivePurchaseForm from "../receive-purchase-form";

const moneyFormatter = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function formatPKR(value: string | number) {
    return `Rs ${moneyFormatter.format(Number(value))}`;
}

function formatTimestamp(value: Date | null) {
    if (!value) return "—";

    return new Intl.DateTimeFormat("en-PK", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Karachi",
    }).format(value);
}

export default async function PurchaseDetailPage({
    params,
}: {
    params: Promise<{ purchaseId: string }>;
}) {
    const { purchaseId } = await params;
    const shop = await requirePermission("products.view");
    const session = await requireSession();

    const [details, canPost] = await Promise.all([
        getPurchaseReceivingDetailsForShop(shop.shopId, purchaseId),
        hasPermission(
            session.user.id,
            shop.shopId,
            "products.update",
        ),
    ]);

    if (!details) notFound();

    const { purchase, items, devices, payments, paymentAccounts } = details;

    const totalPaid = payments.reduce(
        (total, payment) => total.plus(payment.amount),
        new Decimal(0),
    );

    const outstandingAmount = Decimal.max(
        new Decimal(purchase.totalAmount).minus(totalPaid),
        new Decimal(0),
    ).toFixed(2);


    return (
        <main className="space-y-6 p-4 md:p-6">
            <header className="space-y-2">
                <Link
                    href="/purchases"
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                    ← Back to Purchases
                </Link>

                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-sm text-muted-foreground">
                            Purchase Document
                        </p>

                        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                            {purchase.documentNo}
                        </h1>

                        <p className="mt-2 text-sm text-muted-foreground">
                            Supplier: {purchase.supplierName ?? "Unavailable"}
                        </p>
                    </div>

                    <span
                        className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${purchase.status === "DRAFT"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : purchase.status === "POSTED"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                    >
                        {purchase.status}
                    </span>
                </div>
            </header>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                        Purchase Date
                    </p>
                    <p className="mt-2 font-semibold">
                        {purchase.purchaseDate}
                    </p>
                </div>

                <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                        Subtotal
                    </p>
                    <p className="mt-2 font-semibold tabular-nums">
                        {formatPKR(purchase.subtotal)}
                    </p>
                </div>

                <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                        Discount
                    </p>
                    <p className="mt-2 font-semibold tabular-nums">
                        {formatPKR(purchase.discountAmount)}
                    </p>
                </div>

                <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                        Total
                    </p>
                    <p className="mt-2 text-xl font-semibold tabular-nums">
                        {formatPKR(purchase.totalAmount)}
                    </p>
                </div>
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="border-b p-4 md:p-5">
                    <h2 className="font-semibold">Purchase Items</h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-187.5 text-left text-sm">
                        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th scope="col" className="px-4 py-3">
                                    Product
                                </th>
                                <th scope="col" className="px-4 py-3">
                                    SKU
                                </th>
                                <th scope="col" className="px-4 py-3">
                                    Tracking
                                </th>
                                <th scope="col" className="px-4 py-3 text-right">
                                    Quantity
                                </th>
                                <th scope="col" className="px-4 py-3 text-right">
                                    Unit Cost
                                </th>
                                <th scope="col" className="px-4 py-3 text-right">
                                    Line Total
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y">
                            {items.map((item) => (
                                <tr key={item.id}>
                                    <td className="px-4 py-4">
                                        <p className="font-medium">
                                            {item.productName}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {item.variantName}
                                        </p>
                                    </td>

                                    <td className="px-4 py-4">{item.sku}</td>

                                    <td className="px-4 py-4">
                                        {item.trackByImei ? "IMEI" : "Quantity"}
                                    </td>

                                    <td className="px-4 py-4 text-right tabular-nums">
                                        {item.quantity}
                                    </td>

                                    <td className="px-4 py-4 text-right tabular-nums">
                                        {formatPKR(item.unitCost)}
                                    </td>

                                    <td className="px-4 py-4 text-right font-medium tabular-nums">
                                        {formatPKR(item.lineTotal)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {purchase.notes ? (
                    <div className="border-t p-4">
                        <p className="text-sm font-medium">Notes</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {purchase.notes}
                        </p>
                    </div>
                ) : null}
            </section>

            {purchase.status === "DRAFT" && canPost ? (
                <ReceivePurchaseForm
                    purchaseId={purchase.id}
                    documentNo={purchase.documentNo}
                    purchaseTotal={purchase.totalAmount}
                    items={items}
                    paymentAccounts={paymentAccounts}
                />
            ) : purchase.status === "DRAFT" ? (
                <section className="rounded-xl border p-5">
                    <h2 className="font-semibold">Purchase not yet received</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        You can view this draft, but your current role does not have
                        permission to post it.
                    </p>
                </section>
            ) : null}

            {purchase.status === "POSTED" ? (
                <>
                    <section className="rounded-xl border bg-card p-5">
                        <h2 className="font-semibold">Receiving Completed</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Posted at: {formatTimestamp(purchase.postedAt)}
                        </p>
                        <p className="mt-2 text-sm">
                            This purchase has already been posted. The receiving form
                            cannot be submitted again.
                        </p>
                    </section>

                    {devices.length > 0 ? (
                        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                            <div className="border-b p-4 md:p-5">
                                <h2 className="font-semibold">Received IMEI Devices</h2>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full min-w-175 text-left text-sm">
                                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                                        <tr>
                                            <th scope="col" className="px-4 py-3">
                                                Product Variant
                                            </th>
                                            <th scope="col" className="px-4 py-3">
                                                IMEI 1
                                            </th>
                                            <th scope="col" className="px-4 py-3">
                                                IMEI 2
                                            </th>
                                            <th scope="col" className="px-4 py-3">
                                                Serial Number
                                            </th>
                                            <th scope="col" className="px-4 py-3 text-right">
                                                Purchase Cost
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y">
                                        {devices.map((device, index) => {
                                            const item = items.find(
                                                (candidate) =>
                                                    candidate.id === device.purchaseItemId,
                                            );

                                            return (
                                                <tr
                                                    key={`${device.purchaseItemId}-${device.imei1}-${index}`}
                                                >
                                                    <td className="px-4 py-4">
                                                        {item
                                                            ? `${item.productName} — ${item.variantName}`
                                                            : "Product variant"}
                                                    </td>
                                                    <td className="px-4 py-4 font-mono text-xs">
                                                        {device.imei1}
                                                    </td>
                                                    <td className="px-4 py-4 font-mono text-xs">
                                                        {device.imei2 ?? "—"}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        {device.serialNumber ?? "—"}
                                                    </td>
                                                    <td className="px-4 py-4 text-right tabular-nums">
                                                        {formatPKR(device.purchaseCost)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ) : null}

                    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                        <div className="border-b p-4 md:p-5">
                            <h2 className="font-semibold">Recorded Payments</h2>
                        </div>

                        {payments.length === 0 ? (
                            <p className="p-5 text-sm text-muted-foreground">
                                No payment has been recorded for this purchase. The full
                                total remains payable to the supplier.
                            </p>
                        ) : (
                            <div className="divide-y">
                                {payments.map((payment) => (
                                    <div
                                        key={payment.id}
                                        className="flex flex-wrap justify-between gap-3 p-4 text-sm"
                                    >
                                        <div>
                                            <p className="font-medium">{payment.accountName}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {formatTimestamp(payment.paidAt)}
                                            </p>
                                        </div>
                                        <p className="font-semibold tabular-nums">
                                            {formatPKR(payment.amount)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                    <section className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border bg-card p-5">
                            <p className="text-sm text-muted-foreground">
                                Total Paid to Supplier
                            </p>
                            <p className="mt-2 text-xl font-semibold tabular-nums">
                                {formatPKR(totalPaid.toFixed(2))}
                            </p>
                        </div>

                        <div className="rounded-xl border bg-card p-5">
                            <p className="text-sm text-muted-foreground">
                                Outstanding Payable
                            </p>
                            <p className="mt-2 text-xl font-semibold tabular-nums">
                                {formatPKR(outstandingAmount)}
                            </p>
                        </div>
                    </section>

                    {canPost && new Decimal(outstandingAmount).greaterThan(0) ? (
                        <SupplierPaymentForm
                            purchaseId={purchase.id}
                            documentNo={purchase.documentNo}
                            outstandingAmount={outstandingAmount}
                            paymentAccounts={paymentAccounts}
                        />
                    ) : null}
                </>
            ) : null}

            <p className="text-xs text-muted-foreground">
                Posted purchase history is retained. Corrections, supplier returns,
                and reversals should use dedicated workflows rather than directly
                editing inventory or ledger rows.
            </p>
        </main>
    );
}