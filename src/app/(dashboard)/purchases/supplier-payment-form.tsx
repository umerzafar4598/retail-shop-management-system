"use client";

import { useActionState } from "react";

import {
    recordSupplierPaymentAction,
    type SupplierPaymentActionState,
} from "./payment-actions";

type SupplierPaymentFormProps = {
    purchaseId: string;
    documentNo: string;
    outstandingAmount: string;
    paymentAccounts: {
        id: string;
        name: string;
        kind: string;
    }[];
};

const initialState: SupplierPaymentActionState = {
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

export default function SupplierPaymentForm({
    purchaseId,
    documentNo,
    outstandingAmount,
    paymentAccounts,
}: SupplierPaymentFormProps) {
    const [state, formAction, pending] = useActionState(
        recordSupplierPaymentAction,
        initialState,
    );

    return (
        <form
            action={formAction}
            onSubmit={(event) => {
                if (
                    !window.confirm(
                        `Record a supplier payment against ${documentNo}? The selected account's recorded balance will decrease.`,
                    )
                ) {
                    event.preventDefault();
                }
            }}
            className="space-y-4 rounded-xl border bg-card p-5 shadow-sm"
        >
            <div>
                <h2 className="font-semibold">Pay Supplier</h2>

                <p className="mt-1 text-sm text-muted-foreground">
                    Outstanding payable:{" "}
                    <span className="font-semibold text-foreground">
                        {formatPKR(outstandingAmount)}
                    </span>
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                    Record only a payment that has actually been made. This does not
                    receive the inventory again.
                </p>
            </div>

            <input
                type="hidden"
                name="purchaseId"
                value={purchaseId}
            />

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <label
                        htmlFor="supplier-payment-amount"
                        className="text-sm font-medium"
                    >
                        Amount paid (PKR) *
                    </label>

                    <input
                        id="supplier-payment-amount"
                        name="amount"
                        type="number"
                        required
                        min="0.01"
                        max={outstandingAmount}
                        step="0.01"
                        defaultValue=""
                        placeholder="Enter actual payment"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="space-y-1.5">
                    <label
                        htmlFor="supplier-payment-account"
                        className="text-sm font-medium"
                    >
                        Paid from account *
                    </label>

                    <select
                        id="supplier-payment-account"
                        name="financialAccountId"
                        required
                        defaultValue=""
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="" disabled>
                            Select the account actually used
                        </option>

                        {paymentAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                                {account.name} ({account.kind.replaceAll("_", " ")})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {paymentAccounts.length === 0 ? (
                <p className="text-sm text-destructive">
                    No eligible active financial account is available. Configure an
                    appropriate account before recording a payment.
                </p>
            ) : null}

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
                disabled={pending || paymentAccounts.length === 0}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
                {pending ? "Recording payment..." : "Record Supplier Payment"}
            </button>
        </form>
    );
}