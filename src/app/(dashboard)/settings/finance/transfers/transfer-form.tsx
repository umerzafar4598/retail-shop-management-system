"use client";

import {
    useMemo,
    useState,
    useTransition,
} from "react";
import { useRouter } from "next/navigation";

import {
    createAccountTransferAction,
} from "./actions";

import type {
    TransferAccount,
} from "@/lib/finance/account-transfers";

type Props = {
    accounts: TransferAccount[];
};

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

function accountLabel(
    account: TransferAccount,
) {
    const identifier = account.identifier
        ? ` • ${account.identifier}`
        : "";

    return `${account.name} • ${account.provider}${identifier}`;
}

export function TransferForm({
    accounts,
}: Props) {
    const router = useRouter();

    const [sourceAccountId, setSourceAccountId] =
        useState(accounts[0]?.id ?? "");

    const [destinationAccountId, setDestinationAccountId] =
        useState(
            accounts.find(
                (account) =>
                    account.id !== accounts[0]?.id,
            )?.id ?? "",
        );

    const [amount, setAmount] =
        useState("");

    const [reason, setReason] =
        useState("");

    const [message, setMessage] =
        useState<string | null>(null);

    const [isPending, startTransition] =
        useTransition();

    const sourceAccount = useMemo(
        () =>
            accounts.find(
                (account) =>
                    account.id === sourceAccountId,
            ),
        [accounts, sourceAccountId],
    );

    const destinationAccount = useMemo(
        () =>
            accounts.find(
                (account) =>
                    account.id ===
                    destinationAccountId,
            ),
        [accounts, destinationAccountId],
    );

    const availableBalance =
        Number(sourceAccount?.balance ?? "0");

    function handleSourceChange(
        nextSourceId: string,
    ) {
        setSourceAccountId(nextSourceId);

        if (
            nextSourceId === destinationAccountId
        ) {
            const alternative =
                accounts.find(
                    (account) =>
                        account.id !== nextSourceId,
                );

            setDestinationAccountId(
                alternative?.id ?? "",
            );
        }

        setMessage(null);
    }

    function handleSubmit(
        event: React.FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setMessage(null);

        if (!sourceAccountId) {
            setMessage(
                "Select a source account.",
            );
            return;
        }

        if (!destinationAccountId) {
            setMessage(
                "Select a destination account.",
            );
            return;
        }

        if (
            sourceAccountId ===
            destinationAccountId
        ) {
            setMessage(
                "Source and destination accounts must be different.",
            );
            return;
        }

        const numericAmount = Number(amount);

        if (
            !Number.isFinite(numericAmount) ||
            numericAmount <= 0
        ) {
            setMessage(
                "Enter a valid transfer amount greater than zero.",
            );
            return;
        }

        if (
            numericAmount >
            availableBalance
        ) {
            setMessage(
                `Insufficient balance. Available: ${formatBalance(
                    sourceAccount?.balance ?? "0",
                )}.`,
            );
            return;
        }

        if (numericAmount > 999999999999.99) {
            setMessage(
                "Transfer amount is too large.",
            );
            return;
        }

        const confirmed = window.confirm(
            [
                "Confirm account transfer",
                "",
                `From: ${sourceAccount?.name ?? ""}`,
                `To: ${destinationAccount?.name ?? ""}`,
                `Amount: Rs. ${numericAmount.toLocaleString(
                    "en-PK",
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    },
                )}`,
                "",
                "This will create a permanent accounting transaction.",
            ].join("\n"),
        );

        if (!confirmed) {
            return;
        }

        startTransition(async () => {
            const result =
                await createAccountTransferAction({
                    sourceAccountId,
                    destinationAccountId,
                    amount,
                    reason,
                });

            setMessage(result.message);

            if (result.success) {
                setAmount("");
                setReason("");
                router.refresh();
            }
        });
    }

    if (accounts.length < 2) {
        return (
            <div className="rounded-xl border border-dashed p-6">
                <p className="font-medium">
                    At least two active financial accounts are
                    required.
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                    Create another financial account before making
                    a transfer.
                </p>
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-xl border bg-card p-5"
        >
            <div>
                <h2 className="text-lg font-semibold">
                    New Transfer
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                    Move money between the shop&apos;s financial
                    accounts. The transfer is recorded in the
                    accounting ledger automatically.
                </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <label
                        htmlFor="transfer-source"
                        className="text-sm font-medium"
                    >
                        From Account
                    </label>

                    <select
                        id="transfer-source"
                        value={sourceAccountId}
                        onChange={(event) =>
                            handleSourceChange(
                                event.target.value,
                            )
                        }
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                        {accounts.map((account) => (
                            <option
                                key={account.id}
                                value={account.id}
                            >
                                {accountLabel(account)}
                            </option>
                        ))}
                    </select>

                    <p className="text-xs text-muted-foreground">
                        Available balance:{" "}
                        <span className="font-medium text-foreground">
                            {formatBalance(
                                sourceAccount?.balance ??
                                "0",
                            )}
                        </span>
                    </p>
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="transfer-destination"
                        className="text-sm font-medium"
                    >
                        To Account
                    </label>

                    <select
                        id="transfer-destination"
                        value={destinationAccountId}
                        onChange={(event) =>
                            setDestinationAccountId(
                                event.target.value,
                            )
                        }
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="">
                            Select destination
                        </option>

                        {accounts
                            .filter(
                                (account) =>
                                    account.id !==
                                    sourceAccountId,
                            )
                            .map((account) => (
                                <option
                                    key={account.id}
                                    value={account.id}
                                >
                                    {accountLabel(account)}
                                </option>
                            ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="transfer-amount"
                        className="text-sm font-medium"
                    >
                        Amount (PKR)
                    </label>

                    <input
                        id="transfer-amount"
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) =>
                            setAmount(event.target.value)
                        }
                        placeholder="10000.00"
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="transfer-reason"
                        className="text-sm font-medium"
                    >
                        Reason
                        <span className="ml-1 text-muted-foreground">
                            (optional)
                        </span>
                    </label>

                    <input
                        id="transfer-reason"
                        type="text"
                        value={reason}
                        onChange={(event) =>
                            setReason(event.target.value)
                        }
                        maxLength={500}
                        placeholder="Moving cash to Easypaisa"
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
            </div>

            {sourceAccount ? (
                <div className="mt-5 rounded-lg border bg-muted/40 p-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                            <p className="text-xs text-muted-foreground">
                                From
                            </p>

                            <p className="mt-1 text-sm font-medium">
                                {sourceAccount.name}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-muted-foreground">
                                Transfer
                            </p>

                            <p className="mt-1 text-sm font-medium">
                                {amount
                                    ? `Rs. ${Number(amount).toLocaleString(
                                        "en-PK",
                                        {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        },
                                    )}`
                                    : "Rs. 0.00"}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-muted-foreground">
                                After Transfer
                            </p>

                            <p className="mt-1 text-sm font-medium">
                                {Number.isFinite(
                                    availableBalance -
                                    (Number(amount) || 0),
                                )
                                    ? formatBalance(
                                        Math.max(
                                            0,
                                            availableBalance -
                                            (Number(amount) ||
                                                0),
                                        ).toFixed(2),
                                    )
                                    : "Rs. 0.00"}
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}

            {message ? (
                <div
                    className={`mt-4 rounded-md border px-3 py-2 text-sm ${message.includes("successfully")
                        ? "bg-muted"
                        : "border-destructive/50 bg-destructive/10 text-destructive"
                        }`}
                >
                    {message}
                </div>
            ) : null}

            <div className="mt-5">
                <button
                    type="submit"
                    disabled={
                        isPending ||
                        !sourceAccountId ||
                        !destinationAccountId
                    }
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isPending
                        ? "Processing Transfer..."
                        : "Transfer Money"}
                </button>
            </div>
        </form>
    );
}