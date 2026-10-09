"use client";

import { useActionState } from "react";

import {
    setSupplierStatusAction,
    type SupplierActionState,
} from "./actions";

type SupplierRowData = {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    notes: string | null;
    active: boolean;
    createdAt: Date;
};

const initialState: SupplierActionState = {
    status: "idle",
    message: "",
};

export default function SupplierRow({
    supplier,
    canUpdate,
}: {
    supplier: SupplierRowData;
    canUpdate: boolean;
}) {
    const [state, formAction, pending] = useActionState(
        setSupplierStatusAction,
        initialState,
    );

    return (
        <tr className="align-top hover:bg-muted/30">
            <td className="px-4 py-4">
                <p className="font-medium">{supplier.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                    Added{" "}
                    {new Intl.DateTimeFormat("en-PK", {
                        dateStyle: "medium",
                        timeZone: "Asia/Karachi",
                    }).format(supplier.createdAt)}
                </p>
            </td>

            <td className="px-4 py-4">
                {supplier.phone ?? (
                    <span className="text-muted-foreground">Not provided</span>
                )}
            </td>

            <td className="max-w-xs whitespace-normal px-4 py-4">
                {supplier.address ?? (
                    <span className="text-muted-foreground">Not provided</span>
                )}
            </td>

            <td className="max-w-sm whitespace-normal px-4 py-4 text-sm text-muted-foreground">
                {supplier.notes || "—"}
            </td>

            <td className="px-4 py-4">
                <span
                    className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${supplier.active
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                >
                    {supplier.active ? "Active" : "Inactive"}
                </span>
            </td>

            {canUpdate ? (
                <td className="px-4 py-4">
                    <form action={formAction}>
                        <input
                            type="hidden"
                            name="supplierId"
                            value={supplier.id}
                        />
                        <input
                            type="hidden"
                            name="active"
                            value={supplier.active ? "false" : "true"}
                        />

                        <button
                            type="submit"
                            disabled={pending}
                            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
                        >
                            {pending
                                ? "Saving..."
                                : supplier.active
                                    ? "Deactivate"
                                    : "Reactivate"}
                        </button>
                    </form>

                    {state.message ? (
                        <p
                            role="status"
                            className={`mt-2 max-w-40 text-xs ${state.status === "success"
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-destructive"
                                }`}
                        >
                            {state.message}
                        </p>
                    ) : null}
                </td>
            ) : null}
        </tr>
    );
}