import {
    getInventoryStockOverview,
    type InventoryStockStatus,
} from "@/lib/inventory/stock";

const numberFormatter = new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 0,
});

const moneyFormatter = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function formatPKR(value: string | number) {
    return `Rs ${moneyFormatter.format(Number(value))}`;
}

const statusConfig: Record<
    InventoryStockStatus,
    { label: string; className: string }
> = {
    IN_STOCK: {
        label: "In stock",
        className:
            "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    },
    LOW_STOCK: {
        label: "Low stock",
        className:
            "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    },
    OUT_OF_STOCK: {
        label: "Out of stock",
        className:
            "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    },
};

function StockStatusBadge({
    status,
}: {
    status: InventoryStockStatus;
}) {
    const config = statusConfig[status];

    return (
        <span
            className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}
        >
            {config.label}
        </span>
    );
}

function CatalogStatusBadge({
    active,
}: {
    active: boolean;
}) {
    return (
        <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${active
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
                }`}
        >
            {active ? "Active" : "Inactive"}
        </span>
    );
}

function SummaryCard({
    label,
    value,
    description,
}: {
    label: string;
    value: string;
    description?: string;
}) {
    return (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">{label}</p>

            <p className="mt-2 text-2xl font-semibold tracking-tight">
                {value}
            </p>

            {description ? (
                <p className="mt-1 text-xs text-muted-foreground">
                    {description}
                </p>
            ) : null}
        </div>
    );
}

export default async function InventoryStockPage() {
    const overview = await getInventoryStockOverview();

    const alertCount =
        overview.summary.lowStockCount +
        overview.summary.outOfStockCount;

    return (
        <main className="space-y-6 p-4 md:p-6">
            <div>
                <p className="text-sm text-muted-foreground">
                    Inventory
                </p>

                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                    Stock Overview
                </h1>

                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    Review current quantities, inventory cost, selling prices,
                    and replenishment alerts across your product variants.
                </p>
            </div>

            <section
                aria-label="Inventory summary"
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            >
                <SummaryCard
                    label="Catalog Variants"
                    value={numberFormatter.format(
                        overview.summary.variantCount,
                    )}
                    description="Includes inactive variants"
                />

                <SummaryCard
                    label="Units on Hand"
                    value={numberFormatter.format(
                        overview.summary.totalUnits,
                    )}
                    description="Based on recorded inventory balances"
                />

                <SummaryCard
                    label="Inventory Cost Value"
                    value={formatPKR(
                        overview.summary.inventoryCostValue,
                    )}
                    description="Quantity × average cost"
                />

                <SummaryCard
                    label="Stock Alerts"
                    value={numberFormatter.format(alertCount)}
                    description={`${overview.summary.lowStockCount} low stock · ${overview.summary.outOfStockCount} out of stock`}
                />
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="border-b p-4 md:p-5">
                    <h2 className="font-semibold">Inventory Items</h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                        Stock quantities and values for each variant.
                    </p>
                </div>

                {overview.items.length === 0 ? (
                    <div className="p-10 text-center">
                        <h3 className="font-medium">
                            No inventory items yet
                        </h3>

                        <p className="mt-2 text-sm text-muted-foreground">
                            Create a product and its first variant in the
                            product catalog to see it here.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-312.5 text-left text-sm">
                            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th scope="col" className="px-4 py-3">
                                        Product
                                    </th>

                                    <th scope="col" className="px-4 py-3">
                                        Variant / SKU
                                    </th>

                                    <th scope="col" className="px-4 py-3">
                                        Stock
                                    </th>

                                    <th scope="col" className="px-4 py-3 text-right">
                                        Average Cost
                                    </th>

                                    <th scope="col" className="px-4 py-3 text-right">
                                        Stock Value
                                    </th>

                                    <th scope="col" className="px-4 py-3 text-right">
                                        Selling Price
                                    </th>

                                    <th scope="col" className="px-4 py-3">
                                        Reorder At
                                    </th>

                                    <th scope="col" className="px-4 py-3">
                                        Tracking
                                    </th>

                                    <th scope="col" className="px-4 py-3">
                                        Status
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y">
                                {overview.items.map((item) => {
                                    const catalogActive =
                                        item.productActive && item.variantActive;

                                    return (
                                        <tr
                                            key={item.variantId}
                                            className="align-top hover:bg-muted/30"
                                        >
                                            <td className="px-4 py-4">
                                                <p className="font-medium">
                                                    {item.productName}
                                                </p>

                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {item.categoryName ?? "Uncategorized"}
                                                    {item.brandName
                                                        ? ` · ${item.brandName}`
                                                        : ""}
                                                </p>

                                                {!catalogActive ? (
                                                    <div className="mt-2">
                                                        <CatalogStatusBadge active={false} />
                                                    </div>
                                                ) : null}
                                            </td>

                                            <td className="px-4 py-4">
                                                <p className="font-medium">
                                                    {item.variantName}
                                                </p>

                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    SKU: {item.sku}
                                                </p>

                                                {item.barcode ? (
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        Barcode: {item.barcode}
                                                    </p>
                                                ) : null}
                                            </td>

                                            <td className="px-4 py-4">
                                                <span className="font-semibold tabular-nums">
                                                    {numberFormatter.format(item.quantity)}
                                                </span>
                                                <span className="ml-1 text-xs text-muted-foreground">
                                                    units
                                                </span>
                                            </td>

                                            <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">
                                                {formatPKR(item.averageCost)}
                                            </td>

                                            <td className="whitespace-nowrap px-4 py-4 text-right font-medium tabular-nums">
                                                {formatPKR(item.stockValue)}
                                            </td>

                                            <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">
                                                {formatPKR(item.sellingPrice)}
                                            </td>

                                            <td className="px-4 py-4 tabular-nums">
                                                {numberFormatter.format(item.reorderLevel)}
                                            </td>

                                            <td className="px-4 py-4">
                                                <span className="whitespace-nowrap">
                                                    {item.trackByImei
                                                        ? "IMEI"
                                                        : "Quantity"}
                                                </span>
                                            </td>

                                            <td className="px-4 py-4">
                                                <StockStatusBadge status={item.status} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {overview.items.length > 0 ? (
                    <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                        {overview.items.length} variant
                        {overview.items.length === 1 ? "" : "s"} displayed.
                        Inventory cost value includes inactive variants with
                        remaining stock.
                    </div>
                ) : null}
            </section>

            <p className="text-xs text-muted-foreground">
                This page is read-only. Creating a product does not add stock.
                Quantities and average costs will change through validated
                inventory operations, such as purchases and approved adjustments.
            </p>
        </main>
    );
}