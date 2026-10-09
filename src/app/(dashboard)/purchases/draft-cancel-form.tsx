"use client";

import { useActionState } from "react";

import {
    cancelPurchaseDraftAction,
} from "./draft-actions";
import type { PurchaseActionState } from "./actions";

const initialState: PurchaseActionState = {
    status: "idle",
    message: "",
};

export default function CancelPurchaseDraftForm({
    purchaseId,
    documentNo,
}: {
    purchaseId: string;
    documentNo: string;
}) {
    const [state, formAction, pending] = useActionState(
        cancelPurchaseDraftAction,
        initialState,
    );

    return (
        <form
            action={formAction}
            onSubmit={(event) => {
                const confirmed = window.confirm(
                    `Cancel ${documentNo}? This draft will be retained for audit, and it will no longer be editable or postable.`,
                );
                if (!confirmed) event.preventDefault();
            }}
            className="space-y-2"
        >
            <input type="hidden" name="purchaseId" value={purchaseId} />
            <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center justify-center rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {pending ? "Cancelling..." : "Cancel Draft"}
            </button>
            {state.message ? (
                <p
                    role="status"
                    aria-live="polite"
                    className="max-w-sm text-sm text-destructive"
                >
                    {state.message}
                </p>
            ) : null}
        </form>
    );
}
