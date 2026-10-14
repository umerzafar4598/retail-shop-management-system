"use client";

import { useState, useTransition } from "react";
import { setBrandActive } from "./actions";

type Props = { brand: { id: string; name: string; active: boolean } };

export default function BrandRow({ brand }: Props) {
    const [isPending, startTransition] = useTransition();
    const [feedback, setFeedback] = useState("");
    const [failed, setFailed] = useState(false);

    function toggle() {
        setFeedback("");
        startTransition(async () => {
            try {
                await setBrandActive(brand.id, !brand.active);;

                setFeedback("Brand updated successfully.");
                setFailed(false);
            } catch {
                setFeedback("Could not update the brand. Please try again.");
                setFailed(true);
            }
        });
    }

    return (
        <div className="px-6 py-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="font-medium">{brand.name}</p>
                    <p className="text-sm text-slate-500">{brand.active ? "Active" : "Inactive"}</p>
                </div>
                <button type="button" onClick={toggle} disabled={isPending} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
                    {brand.active ? "Deactivate" : "Activate"}
                </button>
            </div>
            {feedback && <p role={failed ? "alert" : "status"} className={`mt-2 text-sm ${failed ? "text-red-600" : "text-slate-600"}`}>{feedback}</p>}
        </div>
    );
}
