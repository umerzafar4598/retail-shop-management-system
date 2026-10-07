"use client";

import { useEffect, useState, useTransition } from "react";

import {
    createFinancialAccountAction,
    updateFinancialAccountAction,
} from "./actions";

import {
    FINANCIAL_ACCOUNT_KIND_OPTIONS,
} from "./constants";

import type {
    CreateFinancialAccountInput,
    FinancialAccount,
    FinancialAccountKind,
} from "@/lib/finance/financial-accounts";

type Props = {
    mode?: "create" | "edit";
    account?: FinancialAccount;
    onComplete?: () => void;
    onCancel?: () => void;
};

function getDefaultProvider(
    kind: FinancialAccountKind,
): string {
    switch (kind) {
        case "DIGITAL_WALLET":
            return "Easypaisa";
        case "BANK":
            return "";
        case "OTHER":
            return "";
        case "CASH":
            return "INTERNAL";
    }
}

export function FinancialAccountForm({
    mode = "create",
    account,
    onComplete,
    onCancel,
}: Props) {
    const isEdit = mode === "edit";

    const [name, setName] = useState(account?.name ?? "");

    const [kind, setKind] = useState<
        Exclude<FinancialAccountKind, "CASH">
    >(
        account?.kind === "BANK" ||
            account?.kind === "DIGITAL_WALLET" ||
            account?.kind === "OTHER"
            ? account.kind
            : "DIGITAL_WALLET",
    );

    const [provider, setProvider] = useState(
        account?.provider ??
        getDefaultProvider("DIGITAL_WALLET"),
    );

    const [identifier, setIdentifier] = useState(
        account?.identifier ?? "",
    );

    const [message, setMessage] = useState<string | null>(
        null,
    );

    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        if (!account) {
            return;
        }

        setName(account.name);

        if (
            account.kind === "DIGITAL_WALLET" ||
            account.kind === "BANK" ||
            account.kind === "OTHER"
        ) {
            setKind(account.kind);
        }

        setProvider(account.provider);
        setIdentifier(account.identifier ?? "");
    }, [account]);

    function handleKindChange(
        nextKind: Exclude<FinancialAccountKind, "CASH">,
    ) {
        setKind(nextKind);

        if (!isEdit) {
            setProvider(getDefaultProvider(nextKind));

            if (nextKind === "OTHER") {
                setProvider("");
            }
        }
    }

    function handleSubmit(
        event: React.FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setMessage(null);

        if (!name.trim()) {
            setMessage("Account name is required.");
            return;
        }

        if (!provider.trim()) {
            setMessage("Provider is required.");
            return;
        }

        if (
            (kind === "DIGITAL_WALLET" || kind === "BANK") &&
            !identifier.trim()
        ) {
            setMessage(
                "An identifier is required for wallet and bank accounts.",
            );
            return;
        }

        startTransition(async () => {
            const result = isEdit
                ? await updateFinancialAccountAction({
                    financialAccountId: account!.id,
                    name,
                    provider,
                    identifier,
                })
                : await createFinancialAccountAction({
                    name,
                    kind,
                    provider,
                    identifier,
                });

            setMessage(result.message);

            if (result.success) {
                if (!isEdit) {
                    setName("");
                    setKind("DIGITAL_WALLET");
                    setProvider("Easypaisa");
                    setIdentifier("");
                }

                onComplete?.();
            }
        });
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-xl border bg-card p-5"
        >
            <div>
                <h2 className="text-lg font-semibold">
                    {isEdit
                        ? "Edit Financial Account"
                        : "Add Financial Account"}
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                    {isEdit
                        ? "Update the account information. Its accounting history remains unchanged."
                        : "Create a shop-specific money account such as Easypaisa, JazzCash, or a bank account."}
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <label
                        htmlFor={`financial-account-name-${mode}`}
                        className="text-sm font-medium"
                    >
                        Account Name
                    </label>

                    <input
                        id={`financial-account-name-${mode}`}
                        value={name}
                        onChange={(event) =>
                            setName(event.target.value)
                        }
                        placeholder="Easypaisa 676"
                        maxLength={100}
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                {!isEdit ? (
                    <div className="space-y-2">
                        <label
                            htmlFor="financial-account-kind"
                            className="text-sm font-medium"
                        >
                            Account Type
                        </label>

                        <select
                            id="financial-account-kind"
                            value={kind}
                            onChange={(event) =>
                                handleKindChange(
                                    event.target.value as Exclude<
                                        FinancialAccountKind,
                                        "CASH"
                                    >,
                                )
                            }
                            disabled={isPending}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        >
                            {FINANCIAL_ACCOUNT_KIND_OPTIONS.map(
                                (option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {option.label}
                                    </option>
                                ),
                            )}
                        </select>
                    </div>
                ) : null}

                <div className="space-y-2">
                    <label
                        htmlFor={`financial-account-provider-${mode}`}
                        className="text-sm font-medium"
                    >
                        Provider / Institution
                    </label>

                    <input
                        id={`financial-account-provider-${mode}`}
                        value={provider}
                        onChange={(event) =>
                            setProvider(event.target.value)
                        }
                        placeholder={
                            kind === "BANK"
                                ? "HBL"
                                : kind === "DIGITAL_WALLET"
                                    ? "Easypaisa"
                                    : "Other"
                        }
                        maxLength={100}
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor={`financial-account-identifier-${mode}`}
                        className="text-sm font-medium"
                    >
                        Identifier
                        {kind === "OTHER" ? (
                            <span className="ml-1 text-muted-foreground">
                                (optional)
                            </span>
                        ) : null}
                    </label>

                    <input
                        id={`financial-account-identifier-${mode}`}
                        value={identifier}
                        onChange={(event) =>
                            setIdentifier(event.target.value)
                        }
                        placeholder={
                            kind === "BANK"
                                ? "Account number"
                                : kind === "DIGITAL_WALLET"
                                    ? "Mobile/account number"
                                    : "Reference"
                        }
                        maxLength={100}
                        disabled={isPending}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
            </div>

            {message ? (
                <div
                    className={`rounded-md border px-3 py-2 text-sm ${message.includes("successfully")
                        ? "border-border bg-muted"
                        : "border-destructive/50 bg-destructive/10 text-destructive"
                        }`}
                >
                    {message}
                </div>
            ) : null}

            <div className="flex items-center gap-2">
                <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isPending
                        ? "Saving..."
                        : isEdit
                            ? "Save Changes"
                            : "Create Account"}
                </button>

                {isEdit && onCancel ? (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isPending}
                        className="rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Cancel
                    </button>
                ) : null}
            </div>
        </form>
    );
}