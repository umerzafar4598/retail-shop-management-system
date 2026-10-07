import {
    listOpeningBalanceAccounts,
} from "@/lib/finance/opening-balances";

import { requirePermission } from "@/lib/authorization";

import { OpeningBalanceRow } from "./opening-balance-row";

export default async function OpeningBalancesPage() {
    const context = await requirePermission(
        "financial_accounts.opening_balance",
    );

    const accounts =
        await listOpeningBalanceAccounts();

    return (
        <main className="space-y-6">
            <div>
                <p className="text-sm text-muted-foreground">
                    Settings / Finance
                </p>

                <h1 className="text-2xl font-semibold tracking-tight">
                    Opening Balances
                </h1>

                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Establish the starting balances for{" "}
                    {context.shopName}. Opening balances are
                    recorded through the accounting ledger and
                    cannot be directly edited or deleted.
                </p>
            </div>

            <div className="rounded-xl border bg-muted/40 p-4">
                <p className="text-sm font-medium">
                    How this works
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                    For each account, the system records a debit
                    to that financial account and a credit to
                    Opening Balance Equity. Once an account has
                    ledger history, its opening balance is locked.
                </p>
            </div>

            {accounts.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                    <p className="font-medium">
                        No financial accounts found.
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                        Create the shop&apos;s financial accounts first.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {accounts.map((account) => (
                        <OpeningBalanceRow
                            key={account.id}
                            account={account}
                        />
                    ))}
                </div>
            )}
        </main>
    );
}