import type { FinancialAccountKind } from "@/lib/finance/financial-accounts";

export const FINANCIAL_ACCOUNT_KIND_OPTIONS: Array<{
    value: FinancialAccountKind;
    label: string;
}> = [
    {
        value: "CASH",
        label: "Cash Drawer",
    },
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
