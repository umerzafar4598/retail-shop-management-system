import type {
    AccountTransfer,
} from "@/lib/finance/account-transfers";

type Props = {
    transfers: AccountTransfer[];
};

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
    return new Intl.DateTimeFormat(
        "en-PK",
        {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Karachi",
        },
    ).format(new Date(value));
}

export function TransferHistory({
    transfers,
}: Props) {
    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-lg font-semibold">
                    Recent Transfers
                </h2>

                <p className="text-sm text-muted-foreground">
                    The latest 100 completed account transfers.
                </p>
            </div>

            {transfers.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                    <p className="font-medium">
                        No transfers yet.
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                        Completed account transfers will appear here.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b bg-muted/40">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium">
                                        Document
                                    </th>

                                    <th className="px-4 py-3 text-left font-medium">
                                        From
                                    </th>

                                    <th className="px-4 py-3 text-left font-medium">
                                        To
                                    </th>

                                    <th className="px-4 py-3 text-right font-medium">
                                        Amount
                                    </th>

                                    <th className="px-4 py-3 text-left font-medium">
                                        Reason
                                    </th>

                                    <th className="px-4 py-3 text-left font-medium">
                                        Date
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {transfers.map((transfer) => (
                                    <tr
                                        key={transfer.id}
                                        className="border-b last:border-b-0"
                                    >
                                        <td className="px-4 py-3 font-medium">
                                            {transfer.documentNo}
                                        </td>

                                        <td className="px-4 py-3">
                                            {transfer.sourceAccountName}
                                        </td>

                                        <td className="px-4 py-3">
                                            {
                                                transfer.destinationAccountName
                                            }
                                        </td>

                                        <td className="px-4 py-3 text-right font-medium">
                                            {formatAmount(
                                                transfer.amount,
                                            )}
                                        </td>

                                        <td className="max-w-xs px-4 py-3 text-muted-foreground">
                                            {transfer.reason ??
                                                "—"}
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                                            {formatDate(
                                                transfer.completedAt,
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </section>
    );
}