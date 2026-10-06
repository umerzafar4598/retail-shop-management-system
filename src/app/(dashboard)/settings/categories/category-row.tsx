"use client";

import { useTransition } from "react";

import { setCategoryActive } from "./actions";

type Props = {
    category: {
        id: string;
        name: string;
        active: boolean;
    };
    parentName: string | null;
};

export default function CategoryRow({
    category,
    parentName,
}: Props) {
    const [isPending, startTransition] = useTransition();

    function toggle() {
        startTransition(async () => {
            await setCategoryActive(
                category.id,
                !category.active,
            );
        });
    }

    return (
        <div className="flex items-center justify-between gap-4 px-6 py-4">
            <div>
                <p className="font-medium">
                    {category.name}
                </p>

                <p className="text-sm text-slate-500">
                    {parentName
                        ? `Parent: ${parentName}`
                        : "Top-level category"}{" "}
                    · {category.active ? "Active" : "Inactive"}
                </p>
            </div>

            <button
                type="button"
                onClick={toggle}
                disabled={isPending}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
                {category.active ? "Deactivate" : "Activate"}
            </button>
        </div>
    );
}