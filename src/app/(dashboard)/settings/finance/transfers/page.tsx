import {
    requirePermission,
} from "@/lib/authorization";

import {
    listAccountTransfers,
    listTransferAccounts,
} from "@/lib/finance/account-transfers";

import { TransferForm } from "./transfer-form";
import { TransferHistory } from "./transfer-history";

export default async function AccountTransfersPage() {
    const context = await requirePermission(
        "account_transfers.view",
    );

    const [accounts, transfers] =
        await Promise.all([
            listTransferAccounts(),
            listAccountTransfers(),
        ]);

    return (
        <main className="space-y-6">
            <div>
                <p className="text-sm text-muted-foreground">
                    Settings / Finance
                </p>

                <h1 className="text-2xl font-semibold tracking-tight">
                    Account Transfers
                </h1>

                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Transfer money between the financial accounts
                    belonging to {context.shopName}.
                </p>
            </div>

            <div className="rounded-xl border bg-muted/40 p-4">
                <p className="text-sm font-medium">
                    Accounting treatment
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                    A transfer credits the source financial account
                    and debits the destination financial account.
                    No revenue or expense is created because ownership
                    of the money has not changed.
                </p>
            </div>

            <TransferForm accounts={accounts} />

            <TransferHistory transfers={transfers} />
        </main>
    );
}