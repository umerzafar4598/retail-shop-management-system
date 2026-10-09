import { hasPermission, requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import {
    getPurchaseDraftOptions,
    listRecentPurchases,
} from "@/lib/purchases/purchase-drafts";
import Link from "next/link";
import PurchaseDraftForm from "./purchase-draft-form";

function getPakistanToday(): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Karachi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());

    const part = (type: string) =>
        parts.find((item) => item.type === type)?.value ?? "";

    return `${part("year")}-${part("month")}-${part("day")}`;
}

const moneyFormatter = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function formatPKR(value: string | number) {
    return `Rs ${moneyFormatter.format(Number(value))}`;
}

function PurchaseStatusBadge({ status }: { status: string }) {
    const classes =
        status === "DRAFT"
            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            : status === "POSTED"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-muted text-muted-foreground";

    return (
        <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}
        >
            {status}
        </span>
    );
}

export default async function PurchasesPage() {
    const shop = await requirePermission("products.view");
    const session = await requireSession();

    const [options, recentPurchases, canCreate] = await Promise.all([
        getPurchaseDraftOptions(shop.shopId),
        listRecentPurchases(shop.shopId),
        hasPermission(
            session.user.id,
            shop.shopId,
            "products.create",
        ),
    ]);

    const draftCount = recentPurchases.filter(
        (purchase) => purchase.status === "DRAFT",
    ).length;

    const postedCount = recentPurchases.filter(
        (purchase) => purchase.status === "POSTED",
    ).length;

    const cancelledCount = recentPurchases.filter(
        (purchase) => purchase.status === "CANCELLED",
    ).length;

    const canStartDraft =
        canCreate &&
        options.suppliers.length > 0 &&
        options.variants.length > 0;

    return (
        <main className="space-y-6 p-4 md:p-6">
            <header>
                <p className="text-sm text-muted-foreground">
                    Inventory / Purchasing
                </p>

                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                    Purchases
                </h1>

                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    Record supplier invoices, prepare stock receiving, and track payments owed
                    to suppliers. Posted purchases update inventory and accounting together.
                </p>
            </header>

            <section className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                        Recent Drafts
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                        {draftCount}
                    </p>
                </div>

                <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                        Recent Posted Purchases
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                        {postedCount}
                    </p>
                </div>

                <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                        Recent Cancelled Purchases
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                        {cancelledCount}
                    </p>
                </div>
            </section>

            {canStartDraft ? (
                <PurchaseDraftForm
                    suppliers={options.suppliers}
                    variants={options.variants}
                    today={getPakistanToday()}
                />
            ) : canCreate ? (
                <section className="rounded-xl border p-5">
                    <h2 className="font-semibold">
                        Setup required before creating a draft
                    </h2>

                    <p className="mt-2 text-sm text-muted-foreground">
                        {options.suppliers.length === 0
                            ? "Add or reactivate a supplier in Settings → Suppliers first."
                            : "Create or reactivate a product and variant in Inventory → Products first."}
                    </p>
                </section>
            ) : null}

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="border-b p-4 md:p-5">
                    <h2 className="font-semibold">Recent Purchases</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        The latest 50 purchase documents for this shop.
                    </p>
                </div>

                {recentPurchases.length === 0 ? (
                    <div className="p-10 text-center">
                        <h3 className="font-medium">No purchases recorded yet</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Save your first purchase draft when you are ready.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-250 text-left text-sm">
                            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th scope="col" className="px-4 py-3">
                                        Document
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Purchase Date
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Supplier
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Status
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-right">
                                        Subtotal
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-right">
                                        Discount
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-right">
                                        Total
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y">
                                {recentPurchases.map((purchase) => (
                                    <tr
                                        key={purchase.id}
                                        className="hover:bg-muted/30"
                                    >
                                        <td className="px-4 py-4">
                                            <Link
                                                href={`/purchases/${purchase.id}`}
                                                className="font-medium underline-offset-4 hover:underline"
                                            >
                                                {purchase.documentNo}
                                            </Link>

                                            {purchase.notes ? (
                                                <p className="mt-1 max-w-xs whitespace-normal text-xs text-muted-foreground">
                                                    {purchase.notes}
                                                </p>
                                            ) : null}
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-4">
                                            {purchase.purchaseDate}
                                        </td>

                                        <td className="px-4 py-4">
                                            {purchase.supplierName ?? "Supplier unavailable"}
                                        </td>

                                        <td className="px-4 py-4">
                                            <PurchaseStatusBadge status={purchase.status} />
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">
                                            {formatPKR(purchase.subtotal)}
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">
                                            {formatPKR(purchase.discountAmount)}
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-4 text-right font-medium tabular-nums">
                                            {formatPKR(purchase.totalAmount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <p className="text-xs text-muted-foreground">
                Drafts do not change inventory or accounting balances. Posting records the
                stock movement, purchase liability, and any initial payment in one
                transaction. Posted documents are retained for audit and corrected
                through dedicated return or reversal workflows.
            </p>
        </main>
    );
}