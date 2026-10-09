"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import {
    setProductStatusAction,
} from "./actions";

import type {
    ProductWithVariants,
} from "@/lib/inventory/catalog";

type Props = {
    product: ProductWithVariants;
    canUpdate: boolean;
};

function formatPrice(value: string) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "Rs. 0.00";
    }

    return `Rs. ${amount.toLocaleString("en-PK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export function ProductRow({
    product,
    canUpdate,
}: Props) {
    const router = useRouter();

    const [isPending, startTransition] =
        useTransition();

    function handleStatusChange() {
        const confirmed =
            window.confirm(
                product.active
                    ? `Deactivate "${product.name}"? Its variants will also become inactive.`
                    : `Reactivate "${product.name}"? Previously inactive variants will remain inactive.`,
            );

        if (!confirmed) {
            return;
        }

        startTransition(async () => {
            const result =
                await setProductStatusAction(
                    product.id,
                    !product.active,
                );

            if (!result.success) {
                window.alert(result.message);
                return;
            }

            router.refresh();
        });
    }

    return (
        <article className="rounded-xl border bg-card">
            <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">
                            {product.name}
                        </h2>

                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {product.categoryName}
                        </span>

                        {product.brandName ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                                {product.brandName}
                            </span>
                        ) : null}

                        <span
                            className={`rounded-full px-2 py-0.5 text-xs ${product.active
                                    ? "bg-muted"
                                    : "bg-destructive/10 text-destructive"
                                }`}
                        >
                            {product.active
                                ? "Active"
                                : "Inactive"}
                        </span>
                    </div>

                    {product.description ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                            {product.description}
                        </p>
                    ) : null}
                </div>

                {canUpdate ? (
                    <button
                        type="button"
                        onClick={
                            handleStatusChange
                        }
                        disabled={isPending}
                        className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                    >
                        {isPending
                            ? "Saving..."
                            : product.active
                                ? "Deactivate"
                                : "Reactivate"}
                    </button>
                ) : null}
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="border-b bg-muted/20">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">
                                Variant
                            </th>

                            <th className="px-4 py-3 text-left font-medium">
                                SKU
                            </th>

                            <th className="px-4 py-3 text-left font-medium">
                                Barcode
                            </th>

                            <th className="px-4 py-3 text-right font-medium">
                                Selling Price
                            </th>

                            <th className="px-4 py-3 text-right font-medium">
                                Stock
                            </th>

                            <th className="px-4 py-3 text-left font-medium">
                                Tracking
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {product.variants.length ===
                            0 ? (
                            <tr>
                                <td
                                    colSpan={6}
                                    className="px-4 py-6 text-center text-muted-foreground"
                                >
                                    No variants found.
                                </td>
                            </tr>
                        ) : (
                            product.variants.map(
                                (variant) => (
                                    <tr
                                        key={variant.id}
                                        className="border-b last:border-b-0"
                                    >
                                        <td className="px-4 py-3 font-medium">
                                            {variant.name}
                                        </td>

                                        <td className="px-4 py-3 font-mono text-xs">
                                            {variant.sku}
                                        </td>

                                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                            {variant.barcode ??
                                                "—"}
                                        </td>

                                        <td className="px-4 py-3 text-right">
                                            {formatPrice(
                                                variant.sellingPrice,
                                            )}
                                        </td>

                                        <td className="px-4 py-3 text-right font-medium">
                                            {variant.quantity}
                                        </td>

                                        <td className="px-4 py-3">
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                                                {variant.trackByImei
                                                    ? "IMEI"
                                                    : "Quantity"}
                                            </span>
                                        </td>
                                    </tr>
                                ),
                            )
                        )}
                    </tbody>
                </table>
            </div>
        </article>
    );
}