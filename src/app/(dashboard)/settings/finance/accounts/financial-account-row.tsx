"use client";

import { useState, useTransition } from "react";

import {
    setFinancialAccountStatusAction,
} from "./actions";

import { FinancialAccountForm } from "./financial-account-form";

import type { FinancialAccount } from "@/lib/finance/financial-accounts";

type Props = {
    account: FinancialAccount;
    canUpdate: boolean;
    canDeactivate: boolean;
};

function formatKind(kind: FinancialAccount["kind"]) {
    switch (kind) {
        case "CASH":
            return "Cash";
        case "DIGITAL_WALLET":
            return "Digital Wallet";
        case "BANK":
            return "Bank";
        case "OTHER":
            return "Other";
    }
}

function formatBalance(value: string) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "Rs. 0.00";
    }

    return `Rs. ${amount.toLocaleString("en-PK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export function FinancialAccountRow({
    account,
    canUpdate,
    canDeactivate,
}: Props) {
    const [editing, setEditing] = useState(false);
    const [message, setMessage] = useState<string | null>(
        null,
    );
    const [isPending, startTransition] = useTransition();

    const isSystem =
        account.ledgerAccountIsSystem ||
        account.kind === "CASH";

    function handleStatusChange() {
        setMessage(null);

        startTransition(async () => {
            const result =
                await setFinancialAccountStatusAction(
                    account.id,
                    !account.isActive,
                );

            setMessage(result.message);
        });
    }

    if (editing) {
        return (
            <FinancialAccountForm
                mode="edit"
                account={account}
                onComplete={() => setEditing(false)}
                onCancel={() => setEditing(false)}
            />
        );
    }

    return (
        <div className="rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">
                            {account.name}
                        </h3>

                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {formatKind(account.kind)}
                        </span>

                        {isSystem ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                                System
                            </span>
                        ) : null}

                        <span
                            className={`rounded-full px-2 py-0.5 text-xs ${account.isActive
                                ? "bg-muted"
                                : "bg-destructive/10 text-destructive"
                                }`}
                        >
                            {account.isActive
                                ? "Active"
                                : "Inactive"}
                        </span>
                    </div>

                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <p>
                            <span className="font-medium">
                                Provider:
                            </span>{" "}
                            {account.provider}
                        </p>

                        {account.identifier ? (
                            <p>
                                <span className="font-medium">
                                    Identifier:
                                </span>{" "}
                                {account.identifier}
                            </p>
                        ) : null}

                        <p>
                            <span className="font-medium">
                                Balance:
                            </span>{" "}
                            <span className="text-foreground">
                                {formatBalance(account.balance)}
                            </span>
                        </p>
                    </div>
                </div>

                {!isSystem &&
                    (canUpdate || canDeactivate) ? (
                    <div className="flex flex-wrap gap-2">
                        {canUpdate ? (
                            <button
                                type="button"
                                onClick={() => setEditing(true)}
                                disabled={isPending}
                                className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                            >
                                Edit
                            </button>
                        ) : null}

                        {canDeactivate ? (
                            <button
                                type="button"
                                onClick={handleStatusChange}
                                disabled={isPending}
                                className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                            >
                                {isPending
                                    ? "Saving..."
                                    : account.isActive
                                        ? "Deactivate"
                                        : "Reactivate"}
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {message ? (
                <p className="mt-3 rounded-md border bg-muted px-3 py-2 text-sm">
                    {message}
                </p>
            ) : null}
        </div>
    );
}