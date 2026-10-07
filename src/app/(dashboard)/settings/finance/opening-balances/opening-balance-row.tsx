"use client";

import {
    useState,
    useTransition,
} from "react";
import { useRouter } from "next/navigation";

import { setOpeningBalanceAction } from "./actions";

import type { OpeningBalanceAccount } from "@/lib/finance/opening-balances";

type Props = {
    account: OpeningBalanceAccount;
};

function formatKind(
    kind: OpeningBalanceAccount["kind"],
) {
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

export function OpeningBalanceRow({
    account,
}: Props) {
    const router = useRouter();

    const [amount, setAmount] = useState("");
    const [message, setMessage] =
        useState<string | null>(null);

    const [isPending, startTransition] =
        useTransition();

    const locked =
        !account.isActive ||
        account.hasLedgerHistory ||
        account.openingBalanceSet;

    function handleSubmit(
        event: React.FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setMessage(null);

        if (!amount.trim()) {
            setMessage("Enter an opening balance.");
            return;
        }

        startTransition(async () => {
            const result =
                await setOpeningBalanceAction(
                    account.id,
                    amount,
                );

            setMessage(result.message);

            if (result.success) {
                setAmount("");
                router.refresh();
            }
        });
    }

    return (
        <div className="rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-semibold">
                                {account.name}
                            </h2>

                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                                {formatKind(account.kind)}
                            </span>

                            {account.isActive ? (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                                    Active
                                </span>
                            ) : (
                                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                                    Inactive
                                </span>
                            )}
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
                                    Current ledger balance:
                                </span>{" "}
                                <span className="text-foreground">
                                    {formatBalance(account.balance)}
                                </span>
                            </p>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                        <p className="font-medium">
                            Opening Balance
                        </p>

                        <p className="mt-1 text-muted-foreground">
                            This creates a permanent accounting entry.
                        </p>
                    </div>
                </div>

                {account.hasLedgerHistory ||
                    account.openingBalanceSet ? (
                    <div className="rounded-md border bg-muted px-3 py-2 text-sm">
                        {account.openingBalanceSet
                            ? "Opening balance has already been recorded for this account."
                            : "This account already has ledger history, so an opening balance cannot be added."}
                    </div>
                ) : !account.isActive ? (
                    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        Inactive accounts cannot receive an opening balance.
                    </div>
                ) : (
                    <form
                        onSubmit={handleSubmit}
                        className="flex flex-col gap-3 sm:flex-row sm:items-end"
                    >
                        <div className="flex-1 space-y-2">
                            <label
                                htmlFor={`opening-balance-${account.id}`}
                                className="text-sm font-medium"
                            >
                                Amount (PKR)
                            </label>

                            <input
                                id={`opening-balance-${account.id}`}
                                type="text"
                                inputMode="decimal"
                                value={amount}
                                onChange={(event) =>
                                    setAmount(event.target.value)
                                }
                                placeholder="50000.00"
                                disabled={isPending}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isPending || locked}
                            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isPending
                                ? "Recording..."
                                : "Set Opening Balance"}
                        </button>
                    </form>
                )}

                {message ? (
                    <div
                        className={`rounded-md border px-3 py-2 text-sm ${message.includes("successfully")
                                ? "bg-muted"
                                : "border-destructive/50 bg-destructive/10 text-destructive"
                            }`}
                    >
                        {message}
                    </div>
                ) : null}
            </div>
        </div>
    );
}