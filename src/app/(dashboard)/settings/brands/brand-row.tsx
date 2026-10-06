"use client";

import { useTransition } from "react";

import { setBrandActive } from "./actions";

type Props = {
    brand: {
        id: string;
        name: string;
        active: boolean;
    };
};

export default function BrandRow({ brand }: Props) {
    const [isPending, startTransition] = useTransition();

    function toggle() {
        startTransition(async () => {
            await setBrandActive(brand.id, !brand.active);
        });
    }

    return (
        <div className="flex items-center justify-between gap-4 px-6 py-4">
            <div>
                <p className="font-medium">
                    {brand.name}
                </p>

                <p className="text-sm text-slate-500">
                    {brand.active ? "Active" : "Inactive"}
                </p>
            </div>

            <button
                type="button"
                onClick={toggle}
                disabled={isPending}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
                {brand.active ? "Deactivate" : "Activate"}
            </button>
        </div>
    );
}