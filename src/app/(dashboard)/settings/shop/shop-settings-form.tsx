"use client";

import { FormEvent, useState } from "react";

import { updateShopSettings } from "./actions";
import type { ShopSettings } from "@/lib/shop";

type Props = {
    shop: ShopSettings;
};

export default function ShopSettingsForm({ shop }: Props) {
    const [name, setName] = useState(shop.name);
    const [phone, setPhone] = useState(shop.phone ?? "");
    const [address, setAddress] = useState(shop.address ?? "");
    const [receiptHeader, setReceiptHeader] = useState(
        shop.receiptHeader ?? "",
    );
    const [receiptFooter, setReceiptFooter] = useState(
        shop.receiptFooter ?? "",
    );
    const [logoUrl, setLogoUrl] = useState(shop.logoUrl ?? "");

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setMessage("");
        setError("");
        setSaving(true);

        try {
            await updateShopSettings({
                name,
                phone: phone || null,
                address: address || null,
                receiptHeader: receiptHeader || null,
                receiptFooter: receiptFooter || null,
                logoUrl: logoUrl || null,
            });

            setMessage("Shop settings saved successfully.");
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to save shop settings.",
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm"
        >
            <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                    <label
                        htmlFor="name"
                        className="text-sm font-medium"
                    >
                        Shop name
                    </label>

                    <input
                        id="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="slug"
                        className="text-sm font-medium"
                    >
                        Slug
                    </label>

                    <input
                        id="slug"
                        value={shop.slug}
                        disabled
                        className="w-full rounded-lg border bg-slate-50 px-3 py-2.5 text-slate-500"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="currency"
                        className="text-sm font-medium"
                    >
                        Currency
                    </label>

                    <input
                        id="currency"
                        value={shop.currency}
                        disabled
                        className="w-full rounded-lg border bg-slate-50 px-3 py-2.5 text-slate-500"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="timezone"
                        className="text-sm font-medium"
                    >
                        Timezone
                    </label>

                    <input
                        id="timezone"
                        value={shop.timezone}
                        disabled
                        className="w-full rounded-lg border bg-slate-50 px-3 py-2.5 text-slate-500"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="phone"
                        className="text-sm font-medium"
                    >
                        Phone
                    </label>

                    <input
                        id="phone"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                    />
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label
                        htmlFor="address"
                        className="text-sm font-medium"
                    >
                        Address
                    </label>

                    <textarea
                        id="address"
                        value={address}
                        onChange={(event) => setAddress(event.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                    />
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label
                        htmlFor="receiptHeader"
                        className="text-sm font-medium"
                    >
                        Receipt header
                    </label>

                    <textarea
                        id="receiptHeader"
                        value={receiptHeader}
                        onChange={(event) =>
                            setReceiptHeader(event.target.value)
                        }
                        rows={2}
                        className="w-full resize-none rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                    />
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label
                        htmlFor="receiptFooter"
                        className="text-sm font-medium"
                    >
                        Receipt footer
                    </label>

                    <textarea
                        id="receiptFooter"
                        value={receiptFooter}
                        onChange={(event) =>
                            setReceiptFooter(event.target.value)
                        }
                        rows={2}
                        className="w-full resize-none rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                    />
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label
                        htmlFor="logoUrl"
                        className="text-sm font-medium"
                    >
                        Logo URL
                    </label>

                    <input
                        id="logoUrl"
                        type="url"
                        value={logoUrl}
                        onChange={(event) => setLogoUrl(event.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-slate-900"
                    />
                </div>
            </div>

            {message && (
                <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                    {message}
                </div>
            )}

            {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {saving ? "Saving..." : "Save changes"}
                </button>
            </div>
        </form>
    );
}