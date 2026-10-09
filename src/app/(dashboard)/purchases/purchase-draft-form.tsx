"use client";

import { useState, useActionState } from "react";

import {
    createPurchaseDraftAction,
    type PurchaseActionState,
} from "./actions";

type SupplierOption = {
    id: string;
    name: string;
};

type VariantOption = {
    id: string;
    sku: string;
    productName: string;
    variantName: string;
    trackByImei: boolean;
};

type PurchaseDraftFormProps = {
    suppliers: SupplierOption[];
    variants: VariantOption[];
    today: string;
};

type DraftLine = {
    key: number;
};

const initialState: PurchaseActionState = {
    status: "idle",
    message: "",
};

export default function PurchaseDraftForm({
    suppliers,
    variants,
    today,
}: PurchaseDraftFormProps) {
    const [state, formAction, pending] = useActionState(
        createPurchaseDraftAction,
        initialState,
    );

    const [lines, setLines] = useState<DraftLine[]>([
        { key: 0 },
    ]);
    const [nextKey, setNextKey] = useState(1);

    function addLine() {
        if (lines.length >= 100) return;

        setLines((current) => [
            ...current,
            { key: nextKey },
        ]);

        setNextKey((current) => current + 1);
    }

    function removeLine(key: number) {
        setLines((current) =>
            current.length > 1
                ? current.filter((line) => line.key !== key)
                : current,
        );
    }

    return (
        <form
            action={formAction}
            className="space-y-5 rounded-xl border bg-card p-5 shadow-sm"
        >
            <div>
                <h2 className="font-semibold">Create Purchase Draft</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Enter the supplier invoice or quote details. Saving this
                    draft does not add stock or record a payment.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <label
                        htmlFor="purchase-supplier"
                        className="text-sm font-medium"
                    >
                        Supplier *
                    </label>

                    <select
                        id="purchase-supplier"
                        name="supplierId"
                        required
                        defaultValue=""
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="" disabled>
                            Select a supplier
                        </option>

                        {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                                {supplier.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1.5">
                    <label
                        htmlFor="purchase-date"
                        className="text-sm font-medium"
                    >
                        Purchase date *
                    </label>

                    <input
                        id="purchase-date"
                        name="purchaseDate"
                        type="date"
                        required
                        defaultValue={today}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
            </div>

            <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="font-medium">Purchase Items</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Choose each variant and enter its quantity and cost per unit.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={addLine}
                        disabled={lines.length >= 100 || pending}
                        className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    >
                        Add item
                    </button>
                </div>

                <div className="space-y-4">
                    {lines.map((line, index) => (
                        <div
                            key={line.key}
                            className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,2fr)_minmax(110px,0.7fr)_minmax(140px,1fr)_auto]"
                        >
                            <div className="space-y-1.5">
                                <label
                                    htmlFor={`purchase-variant-${line.key}`}
                                    className="text-sm font-medium"
                                >
                                    Product variant *
                                </label>

                                <select
                                    id={`purchase-variant-${line.key}`}
                                    name="variantId"
                                    required
                                    defaultValue=""
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                >
                                    <option value="" disabled>
                                        Select a variant
                                    </option>

                                    {variants.map((variant) => (
                                        <option key={variant.id} value={variant.id}>
                                            {variant.productName} — {variant.variantName}
                                            {" · "}
                                            {variant.sku}
                                            {variant.trackByImei ? " · IMEI" : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label
                                    htmlFor={`purchase-quantity-${line.key}`}
                                    className="text-sm font-medium"
                                >
                                    Quantity *
                                </label>

                                <input
                                    id={`purchase-quantity-${line.key}`}
                                    name="quantity"
                                    type="number"
                                    min="1"
                                    max="1000000"
                                    step="1"
                                    required
                                    defaultValue="1"
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label
                                    htmlFor={`purchase-cost-${line.key}`}
                                    className="text-sm font-medium"
                                >
                                    Unit cost (PKR) *
                                </label>

                                <input
                                    id={`purchase-cost-${line.key}`}
                                    name="unitCost"
                                    type="number"
                                    min="0"
                                    max="999999999999.99"
                                    step="0.01"
                                    required
                                    placeholder="0.00"
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>

                            <div className="flex items-end">
                                <button
                                    type="button"
                                    onClick={() => removeLine(line.key)}
                                    disabled={lines.length === 1 || pending}
                                    aria-label={`Remove item ${index + 1}`}
                                    className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <p className="text-xs text-muted-foreground">
                    Enter actual costs from your supplier&apos;s quote or invoice.
                    For IMEI-tracked products, individual IMEIs will be recorded
                    during the receiving step, not while drafting the purchase.
                </p>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <label
                        htmlFor="purchase-discount"
                        className="text-sm font-medium"
                    >
                        Overall discount (PKR)
                    </label>

                    <input
                        id="purchase-discount"
                        name="discountAmount"
                        type="number"
                        min="0"
                        max="999999999999.99"
                        step="0.01"
                        defaultValue="0.00"
                        required
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />

                    <p className="text-xs text-muted-foreground">
                        The server calculates the subtotal and final total.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label
                        htmlFor="purchase-notes"
                        className="text-sm font-medium"
                    >
                        Notes
                    </label>

                    <textarea
                        id="purchase-notes"
                        name="notes"
                        rows={3}
                        maxLength={2000}
                        placeholder="Supplier invoice reference or other details"
                        className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
            </div>

            {state.message ? (
                <p
                    role="status"
                    aria-live="polite"
                    className={`text-sm ${state.status === "success"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-destructive"
                        }`}
                >
                    {state.message}
                </p>
            ) : null}

            <button
                type="submit"
                disabled={pending || suppliers.length === 0 || variants.length === 0}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
                {pending ? "Saving draft..." : "Save Purchase Draft"}
            </button>
        </form>
    );
}