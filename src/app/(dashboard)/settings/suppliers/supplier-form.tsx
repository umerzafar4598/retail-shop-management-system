"use client";

import { useActionState } from "react";

import {
    createSupplierAction,
    type SupplierActionState,
} from "./actions";

const initialState: SupplierActionState = {
    status: "idle",
    message: "",
};

export default function SupplierForm() {
    const [state, formAction, pending] = useActionState(
        createSupplierAction,
        initialState,
    );

    return (
        <form
            action={formAction}
            className="space-y-4 rounded-xl border bg-card p-5 shadow-sm"
        >
            <div>
                <h2 className="font-semibold">Add Supplier</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Save the contact details of a supplier your shop actually uses.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <label htmlFor="supplier-name" className="text-sm font-medium">
                        Supplier name *
                    </label>
                    <input
                        id="supplier-name"
                        name="name"
                        required
                        maxLength={150}
                        autoComplete="organization"
                        placeholder="Supplier or distributor name"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="supplier-phone" className="text-sm font-medium">
                        Phone
                    </label>
                    <input
                        id="supplier-phone"
                        name="phone"
                        type="tel"
                        maxLength={50}
                        autoComplete="tel"
                        placeholder="Supplier contact number"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                    <label htmlFor="supplier-address" className="text-sm font-medium">
                        Address
                    </label>
                    <input
                        id="supplier-address"
                        name="address"
                        maxLength={500}
                        autoComplete="street-address"
                        placeholder="Shop, market, or business address"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                    <label htmlFor="supplier-notes" className="text-sm font-medium">
                        Notes
                    </label>
                    <textarea
                        id="supplier-notes"
                        name="notes"
                        rows={3}
                        maxLength={2000}
                        placeholder="Payment terms or other useful details"
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
                disabled={pending}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
                {pending ? "Saving supplier..." : "Save Supplier"}
            </button>
        </form>
    );
}