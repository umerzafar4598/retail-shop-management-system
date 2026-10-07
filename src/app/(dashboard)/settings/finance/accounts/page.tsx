import {
    hasPermission,
    requirePermission,
} from "@/lib/authorization";
import { getCurrentSession } from "@/lib/session";

import {
    listFinancialAccounts,
} from "@/lib/finance/financial-accounts";

import { FinancialAccountForm } from "./financial-account-form";
import { FinancialAccountRow } from "./financial-account-row";

export default async function FinancialAccountsPage() {
    const context = await requirePermission(
        "financial_accounts.view",
    );

    const session = await getCurrentSession();

    if (!session) {
        throw new Error(
            "Authenticated session unexpectedly disappeared.",
        );
    }

    const [
        accounts,
        canCreate,
        canUpdate,
        canDeactivate,
    ] = await Promise.all([
        listFinancialAccounts(),

        hasPermission(
            session.user.id,
            context.shopId,
            "financial_accounts.create",
        ),

        hasPermission(
            session.user.id,
            context.shopId,
            "financial_accounts.update",
        ),

        hasPermission(
            session.user.id,
            context.shopId,
            "financial_accounts.deactivate",
        ),
    ]);

    return (
        <main className="space-y-6">
            <div>
                <p className="text-sm text-muted-foreground">
                    Settings / Finance
                </p>

                <h1 className="text-2xl font-semibold tracking-tight">
                    Financial Accounts
                </h1>

                <p className="mt-1 text-sm text-muted-foreground">
                    Manage the real money locations used by{" "}
                    {context.shopName}.
                </p>
            </div>

            {canCreate ? (
                <FinancialAccountForm />
            ) : null}

            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">
                            Accounts
                        </h2>

                        <p className="text-sm text-muted-foreground">
                            Balances are calculated from the accounting
                            ledger.
                        </p>
                    </div>

                    <span className="text-sm text-muted-foreground">
                        {accounts.length}{" "}
                        {accounts.length === 1
                            ? "account"
                            : "accounts"}
                    </span>
                </div>

                {accounts.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center">
                        <p className="font-medium">
                            No financial accounts found.
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                            Add the shop&apos;s Easypaisa, JazzCash, bank, or
                            other financial accounts.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {accounts.map((account) => (
                            <FinancialAccountRow
                                key={account.id}
                                account={account}
                                canUpdate={canUpdate}
                                canDeactivate={canDeactivate}
                            />
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}