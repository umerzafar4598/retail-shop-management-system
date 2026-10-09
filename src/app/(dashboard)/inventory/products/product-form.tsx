"use client";

import {
    useState,
    useTransition,
} from "react";
import { useRouter } from "next/navigation";

import {
    createProductAction,
} from "./actions";

import type {
    ProductFormOptions,
} from "@/lib/inventory/catalog";

type Props = {
    options: ProductFormOptions;
};

export function ProductForm({
    options,
}: Props) {
    const router = useRouter();

    const [name, setName] =
        useState("");

    const [description, setDescription] =
        useState("");

    const [categoryId, setCategoryId] =
        useState("");

    const [brandId, setBrandId] =
        useState("");

    const [variantName, setVariantName] =
        useState("");

    const [sku, setSku] =
        useState("");

    const [barcode, setBarcode] =
        useState("");

    const [sellingPrice, setSellingPrice] =
        useState("");

    const [trackByImei, setTrackByImei] =
        useState(false);

    const [reorderLevel, setReorderLevel] =
        useState("0");

    const [message, setMessage] =
        useState<string | null>(null);

    const [
        isPending,
        startTransition,
    ] = useTransition();

    function resetForm() {
        setName("");
        setDescription("");
        setCategoryId("");
        setBrandId("");
        setVariantName("");
        setSku("");
        setBarcode("");
        setSellingPrice("");
        setTrackByImei(false);
        setReorderLevel("0");
    }

    function handleSubmit(
        event: React.FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setMessage(null);

        if (!name.trim()) {
            setMessage(
                "Product name is required.",
            );
            return;
        }

        if (!categoryId) {
            setMessage(
                "Select a category.",
            );
            return;
        }

        if (!variantName.trim()) {
            setMessage(
                "Variant name is required.",
            );
            return;
        }

        if (!sku.trim()) {
            setMessage("SKU is required.");
            return;
        }

        if (!sellingPrice.trim()) {
            setMessage(
                "Selling price is required.",
            );
            return;
        }

        startTransition(async () => {
            const result =
                await createProductAction({
                    name,
                    description,
                    categoryId,
                    brandId,
                    variantName,
                    sku,
                    barcode,
                    sellingPrice,
                    trackByImei,
                    reorderLevel,
                });

            setMessage(result.message);

            if (result.success) {
                resetForm();
                router.refresh();
            }
        });
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-xl border bg-card p-5"
        >
            <div>
                <h2 className="text-lg font-semibold">
                    Add Product
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                    Create the product and its first variant
                    together. Stock starts at zero until inventory is
                    received.
                </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <label
                        htmlFor="product-name"
                        className="text-sm font-medium"
                    >
                        Product Name
                    </label>

                    <input
                        id="product-name"
                        value={name}
                        onChange={(event) =>
                            setName(event.target.value)
                        }
                        placeholder="Samsung Galaxy A15"
                        maxLength={150}
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="product-category"
                        className="text-sm font-medium"
                    >
                        Category
                    </label>

                    <select
                        id="product-category"
                        value={categoryId}
                        onChange={(event) =>
                            setCategoryId(
                                event.target.value,
                            )
                        }
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="">
                            Select category
                        </option>

                        {options.categories.map(
                            (category) => (
                                <option
                                    key={category.id}
                                    value={category.id}
                                >
                                    {category.name}
                                </option>
                            ),
                        )}
                    </select>
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="product-brand"
                        className="text-sm font-medium"
                    >
                        Brand
                        <span className="ml-1 text-muted-foreground">
                            (optional)
                        </span>
                    </label>

                    <select
                        id="product-brand"
                        value={brandId}
                        onChange={(event) =>
                            setBrandId(
                                event.target.value,
                            )
                        }
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="">
                            No brand
                        </option>

                        {options.brands.map(
                            (brand) => (
                                <option
                                    key={brand.id}
                                    value={brand.id}
                                >
                                    {brand.name}
                                </option>
                            ),
                        )}
                    </select>
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="product-variant-name"
                        className="text-sm font-medium"
                    >
                        Variant Name
                    </label>

                    <input
                        id="product-variant-name"
                        value={variantName}
                        onChange={(event) =>
                            setVariantName(
                                event.target.value,
                            )
                        }
                        placeholder="128GB Black"
                        maxLength={150}
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="product-sku"
                        className="text-sm font-medium"
                    >
                        SKU
                    </label>

                    <input
                        id="product-sku"
                        value={sku}
                        onChange={(event) =>
                            setSku(event.target.value)
                        }
                        placeholder="SAM-A15-128-BLK"
                        maxLength={100}
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="product-barcode"
                        className="text-sm font-medium"
                    >
                        Barcode
                        <span className="ml-1 text-muted-foreground">
                            (optional)
                        </span>
                    </label>

                    <input
                        id="product-barcode"
                        value={barcode}
                        onChange={(event) =>
                            setBarcode(
                                event.target.value,
                            )
                        }
                        placeholder="896400..."
                        maxLength={100}
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="product-selling-price"
                        className="text-sm font-medium"
                    >
                        Selling Price (PKR)
                    </label>

                    <input
                        id="product-selling-price"
                        value={sellingPrice}
                        onChange={(event) =>
                            setSellingPrice(
                                event.target.value,
                            )
                        }
                        inputMode="decimal"
                        placeholder="219999.00"
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="product-reorder-level"
                        className="text-sm font-medium"
                    >
                        Reorder Level
                    </label>

                    <input
                        id="product-reorder-level"
                        type="number"
                        min={0}
                        step={1}
                        value={reorderLevel}
                        onChange={(event) =>
                            setReorderLevel(
                                event.target.value,
                            )
                        }
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
            </div>

            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                    <input
                        type="checkbox"
                        checked={trackByImei}
                        onChange={(event) =>
                            setTrackByImei(
                                event.target.checked,
                            )
                        }
                        disabled={isPending}
                        className="mt-1 size-4"
                    />

                    <span>
                        <span className="block text-sm font-medium">
                            Track by IMEI / Serial
                        </span>

                        <span className="mt-1 block text-xs text-muted-foreground">
                            Enable this for phones and other serialized
                            devices. Each physical unit will later have
                            its own IMEI record.
                        </span>
                    </span>
                </label>
            </div>

            {message ? (
                <div
                    className={`mt-4 rounded-md border px-3 py-2 text-sm ${message.includes("successfully")
                            ? "bg-muted"
                            : "border-destructive/50 bg-destructive/10 text-destructive"
                        }`}
                >
                    {message}
                </div>
            ) : null}

            <div className="mt-5">
                <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isPending
                        ? "Creating..."
                        : "Create Product"}
                </button>
            </div>
        </form>
    );
}