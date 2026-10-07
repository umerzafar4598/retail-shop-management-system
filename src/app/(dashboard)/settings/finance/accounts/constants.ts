import type { FinancialAccountKind } from "@/lib/finance/financial-accounts";

export const FINANCIAL_ACCOUNT_KIND_OPTIONS: Array<{
    value: Exclude<FinancialAccountKind, "CASH">;
    label: string;
}> = [
        {
            value: "DIGITAL_WALLET",
            label: "Digital Wallet",
        },
        {
            value: "BANK",
            label: "Bank Account",
        },
        {
            value: "OTHER",
            label: "Other Financial Account",
        },
    ];