import {
    requirePermission,
} from "@/lib/authorization";

import {
    listLedgerAccountsWithBalances,
    listLedgerTransactions,
} from "@/lib/finance/ledger-history";

function formatAmount(value: string) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "Rs. 0.00";
    }

    return `Rs. ${amount.toLocaleString("en-PK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function formatDate(value: Date) {
    return new Intl.DateTimeFormat("en-PK", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Karachi",
    }).format(new Date(value));
}

function formatAccountType(
    accountType:
        | "ASSET"
        | "LIABILITY"
        | "EQUITY"
        | "REVENUE"
        | "EXPENSE",
) {
    switch (accountType) {
        case "ASSET":
            return "Asset";
        case "LIABILITY":
            return "Liability";
        case "EQUITY":
            return "Equity";
        case "REVENUE":
            return "Revenue";
        case "EXPENSE":
            return "Expense";
    }
}

function getIndentClass(
    parentId: string | null,
) {
    return parentId
        ? "pl-8"
        : "";
}


export default async function LedgerPage() {
    const context = await requirePermission(
        "ledger.view",
    );

    const [
        rawAccounts,
        transactions,
    ] = await Promise.all([
        listLedgerAccountsWithBalances(),
        listLedgerTransactions(100),
    ]);

    const accounts = rawAccounts;

    return (
        <main className="space-y-8">
            <div>
                <p className="text-sm text-muted-foreground">
                    Settings / Finance
                </p>

                <h1 className="text-2xl font-semibold tracking-tight">
                    Ledger
                </h1>

                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    Read-only accounting history for{" "}
                    {context.shopName}. Balances shown here are
                    calculated from ledger entries.
                </p>
            </div>

            <section className="space-y-3">
                <div>
                    <h2 className="text-lg font-semibold">
                        Chart of Accounts
                    </h2>

                    <p className="text-sm text-muted-foreground">
                        System and financial ledger accounts.
                    </p>
                </div>

                <div className="overflow-hidden rounded-xl border">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b bg-muted/40">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium">
                                        Code
                                    </th>

                                    <th className="px-4 py-3 text-left font-medium">
                                        Account
                                    </th>

                                    <th className="px-4 py-3 text-left font-medium">
                                        Type
                                    </th>

                                    <th className="px-4 py-3 text-left font-medium">
                                        Normal Balance
                                    </th>

                                    <th className="px-4 py-3 text-right font-medium">
                                        Balance
                                    </th>

                                    <th className="px-4 py-3 text-left font-medium">
                                        Status
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {accounts.map((account) => (
                                    <tr
                                        key={account.id}
                                        className="border-b last:border-b-0"
                                    >
                                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                                            {account.code}
                                        </td>

                                        <td
                                            className={`px-4 py-3 font-medium ${getIndentClass(
                                                account.parentId,
                                            )}`}
                                        >
                                            {account.parentId ? "└ " : ""}
                                            {account.name}

                                            {account.isSystem ? (
                                                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">
                                                    System
                                                </span>
                                            ) : null}
                                        </td>

                                        <td className="px-4 py-3 text-muted-foreground">
                                            {formatAccountType(
                                                account.accountType,
                                            )}
                                        </td>

                                        <td className="px-4 py-3 text-muted-foreground">
                                            {account.normalBalance}
                                        </td>

                                        <td className="px-4 py-3 text-right font-medium">
                                            {formatAmount(
                                                account.balance,
                                            )}
                                        </td>

                                        <td className="px-4 py-3">
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs ${account.active
                                                    ? "bg-muted"
                                                    : "bg-destructive/10 text-destructive"
                                                    }`}
                                            >
                                                {account.active
                                                    ? "Active"
                                                    : "Inactive"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">
                        Recent Ledger Transactions
                    </h2>

                    <p className="text-sm text-muted-foreground">
                        Showing the latest 100 accounting transactions.
                    </p>
                </div>

                {transactions.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center">
                        <p className="font-medium">
                            No ledger transactions yet.
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                            Opening balances and future financial activity
                            will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {transactions.map(
                            (transaction) => (
                                <article
                                    key={transaction.id}
                                    className="overflow-hidden rounded-xl border bg-card"
                                >
                                    <div className="flex flex-col gap-3 border-b bg-muted/30 p-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                                    {
                                                        transaction.referenceType
                                                    }
                                                </span>

                                                {transaction.referenceId ? (
                                                    <span className="font-mono text-xs text-muted-foreground">
                                                        {
                                                            transaction.referenceId
                                                        }
                                                    </span>
                                                ) : null}
                                            </div>

                                            <h3 className="mt-2 font-semibold">
                                                {
                                                    transaction.description
                                                }
                                            </h3>

                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {formatDate(
                                                    transaction.occurredAt,
                                                )}{" "}
                                                · Created by{" "}
                                                {
                                                    transaction.createdByName
                                                }
                                            </p>
                                        </div>

                                        <div className="text-left lg:text-right">
                                            <p className="text-sm font-medium">
                                                Balanced Transaction
                                            </p>

                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Debit{" "}
                                                {formatAmount(
                                                    transaction.totalDebit,
                                                )}{" "}
                                                · Credit{" "}
                                                {formatAmount(
                                                    transaction.totalCredit,
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="border-b">
                                                <tr>
                                                    <th className="px-4 py-2 text-left font-medium">
                                                        Account
                                                    </th>

                                                    <th className="px-4 py-2 text-right font-medium">
                                                        Debit
                                                    </th>

                                                    <th className="px-4 py-2 text-right font-medium">
                                                        Credit
                                                    </th>

                                                    <th className="px-4 py-2 text-left font-medium">
                                                        Description
                                                    </th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                {transaction.entries.map(
                                                    (entry) => (
                                                        <tr
                                                            key={entry.id}
                                                            className="border-b last:border-b-0"
                                                        >
                                                            <td className="px-4 py-2">
                                                                <span className="font-mono text-xs text-muted-foreground">
                                                                    {
                                                                        entry.ledgerAccountCode
                                                                    }
                                                                </span>{" "}
                                                                {
                                                                    entry.ledgerAccountName
                                                                }
                                                            </td>

                                                            <td className="px-4 py-2 text-right">
                                                                {Number(
                                                                    entry.debit,
                                                                ) > 0
                                                                    ? formatAmount(
                                                                        entry.debit,
                                                                    )
                                                                    : "—"}
                                                            </td>

                                                            <td className="px-4 py-2 text-right">
                                                                {Number(
                                                                    entry.credit,
                                                                ) > 0
                                                                    ? formatAmount(
                                                                        entry.credit,
                                                                    )
                                                                    : "—"}
                                                            </td>

                                                            <td className="px-4 py-2 text-muted-foreground">
                                                                {
                                                                    entry.description ??
                                                                    "—"
                                                                }
                                                            </td>
                                                        </tr>
                                                    ),
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </article>
                            ),
                        )}
                    </div>
                )}
            </section>
        </main>
    );
}