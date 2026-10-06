import { getCurrentShop } from "@/lib/shop";

import ShopSettingsForm from "./shop-settings-form";

export default async function ShopSettingsPage() {
    const shop = await getCurrentShop();

    return (
        <main className="mx-auto max-w-4xl px-6 py-8">
            <div className="mb-8">
                <h1 className="text-2xl font-semibold">
                    Shop Settings
                </h1>

                <p className="mt-2 text-sm text-slate-500">
                    Manage your shop information and receipt settings.
                </p>
            </div>

            <ShopSettingsForm shop={shop} />
        </main>
    );
}