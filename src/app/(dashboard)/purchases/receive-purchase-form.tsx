"use client";

import { useActionState } from "react";

import {
    receivePurchaseAction,
    type ReceivePurchaseActionState,
} from "./receive-actions";

type ReceivePurchaseFormProps = {
    purchaseId: string;
    documentNo: string;
    purchaseTotal: string;
    items: {
        id: string;
        productName: string;
        variantName: string;
        sku: string;
        quantity: number;
        unitCost: string;
        lineTotal: string;
        trackByImei: boolean;
    }[];
    paymentAccounts: {
        id: string;
        name: string;
        kind: string;
    }[];
};

const initialState: ReceivePurchaseActionState = {
    status: "idle",
    message: "",
};

const moneyFormatter = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function formatPKR(value: string | number) {
    return `Rs ${moneyFormatter.format(Number(value))}`;
}

export default function ReceivePurchaseForm({
    purchaseId,
    documentNo,
    purchaseTotal,
    items,
    paymentAccounts,
}: ReceivePurchaseFormProps) {
    const [state, formAction, pending] = useActionState(
        receivePurchaseAction,
        initialState,
    );

    return (
        <form
            action={formAction}
            onSubmit={(event) => {
                const confirmed = window.confirm(
                    `Permanently receive and post ${documentNo}? This changes inventory and accounting history.`,
                );

                if (!confirmed) {
                    event.preventDefault();
                }
            }}
            className="space-y-5 rounded-xl border border-amber-300 bg-card p-5 shadow-sm dark:border-amber-900"
        >
            <div>
                <h2 className="font-semibold">Receive and Post</h2>

                <p className="mt-1 text-sm text-muted-foreground">
                    Verify the physical goods and enter required device identifiers
                    before finalizing this purchase.
                </p>
            </div>

            <input type="hidden" name="purchaseId" value={purchaseId} />

            <div className="overflow-x-auto">
                <table className="w-full min-w-162.5 text-left text-sm">
                    <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th scope="col" className="px-3 py-3">
                                Variant
                            </th>
                            <th scope="col" className="px-3 py-3">
                                Quantity
                            </th>
                            <th scope="col" className="px-3 py-3 text-right">
                                Unit Cost
                            </th>
                            <th scope="col" className="px-3 py-3 text-right">
                                Line Total
                            </th>
                        </tr>
                    </thead>

                    <tbody className="divide-y">
                        {items.map((item) => (
                            <tr key={item.id}>
                                <td className="px-3 py-3">
                                    <p className="font-medium">{item.productName}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {item.variantName} · {item.sku}
                                    </p>
                                </td>

                                <td className="px-3 py-3 tabular-nums">
                                    {item.quantity}
                                </td>

                                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                                    {formatPKR(item.unitCost)}
                                </td>

                                <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">
                                    {formatPKR(item.lineTotal)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {items.some((item) => item.trackByImei) ? (
                <section className="space-y-4">
                    <div>
                        <h3 className="font-medium">Device IMEIs</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Enter one device per line. Use the device&apos;s actual identifiers,
                            not sample or placeholder numbers.
                        </p>
                    </div>

                    {items
                        .filter((item) => item.trackByImei)
                        .map((item) => (
                            <div key={item.id} className="space-y-2">
                                <label
                                    htmlFor={`imei-${item.id}`}
                                    className="block text-sm font-medium"
                                >
                                    {item.productName} — {item.variantName} ({item.sku})
                                </label>

                                <p className="text-xs text-muted-foreground">
                                    Exactly {item.quantity} non-empty device line(s) required.
                                    IMEI 1 is required; IMEI 2 and serial number are optional.
                                </p>

                                <textarea
                                    id={`imei-${item.id}`}
                                    name={`imei:${item.id}`}
                                    required
                                    rows={Math.min(6, Math.max(3, item.quantity))}
                                    maxLength={100000}
                                    spellCheck={false}
                                    placeholder={
                                        "IMEI1 | IMEI2 | Serial number\nIMEI1 | | Serial number"
                                    }
                                    className="w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                        ))}

                    <p className="text-xs text-muted-foreground">
                        The server validates IMEI format, quantity, and duplicates.
                        Device records and their inventory movements are saved in the
                        same transaction as the purchase.
                    </p>
                </section>
            ) : null}

            <section className="space-y-4 rounded-lg border p-4">
                <div>
                    <h3 className="font-medium">Supplier Payment</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Purchase total:{" "}
                        <span className="font-semibold text-foreground">
                            {formatPKR(purchaseTotal)}
                        </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Enter what you are actually paying now. Any remaining amount
                        will be recorded as payable to the supplier.
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <label
                            htmlFor="paid-amount"
                            className="text-sm font-medium"
                        >
                            Amount paid now (PKR)
                        </label>

                        <input
                            id="paid-amount"
                            name="paidAmount"
                            type="number"
                            min="0"
                            max={purchaseTotal}
                            step="0.01"
                            defaultValue="0.00"
                            required
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor="payment-account"
                            className="text-sm font-medium"
                        >
                            Paid from
                        </label>

                        <select
                            id="payment-account"
                            name="financialAccountId"
                            defaultValue=""
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        >
                            <option value="">
                                No payment / choose only if paying now
                            </option>

                            {paymentAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                    {account.name} ({account.kind.replaceAll("_", " ")})
                                </option>
                            ))}
                        </select>

                        {paymentAccounts.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                No active payment accounts are available. You can post the
                                purchase as payable and record payment later.
                            </p>
                        ) : null}
                    </div>
                </div>

                <p className="text-xs text-muted-foreground">
                    Payments above the selected account&apos;s recorded balance are rejected.
                    Choose the exact shop account used for the payment.
                </p>
            </section>

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
                {pending ? "Posting purchase..." : "Receive and Post Purchase"}
            </button>
        </form>
    );
}