"use server";

import { revalidatePath } from "next/cache";

import {
    createFinancialAccount,
    setFinancialAccountStatus,
    updateFinancialAccount,
    type CreateFinancialAccountInput,
    type UpdateFinancialAccountInput,
} from "@/lib/finance/financial-accounts";

type FinanceAccountActionResult = {
    success: boolean;
    message: string;
};

const FINANCE_ACCOUNTS_PATH = "/settings/finance/accounts";

export async function createFinancialAccountAction(
    input: CreateFinancialAccountInput,
): Promise<FinanceAccountActionResult> {
    try {
        await createFinancialAccount(input);

        revalidatePath(FINANCE_ACCOUNTS_PATH);

        return {
            success: true,
            message: `${input.name.trim()} was created successfully.`,
        };
    } catch (error) {
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Failed to create the financial account.",
        };
    }
}

export async function updateFinancialAccountAction(
    input: UpdateFinancialAccountInput,
): Promise<FinanceAccountActionResult> {
    try {
        await updateFinancialAccount(input);

        revalidatePath(FINANCE_ACCOUNTS_PATH);

        return {
            success: true,
            message: `${input.name.trim()} was updated successfully.`,
        };
    } catch (error) {
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Failed to update the financial account.",
        };
    }
}

export async function setFinancialAccountStatusAction(
    financialAccountId: string,
    isActive: boolean,
): Promise<FinanceAccountActionResult> {
    try {
        await setFinancialAccountStatus(
            financialAccountId,
            isActive,
        );

        revalidatePath(FINANCE_ACCOUNTS_PATH);

        return {
            success: true,
            message: isActive
                ? "Financial account reactivated successfully."
                : "Financial account deactivated successfully.",
        };
    } catch (error) {
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Failed to change the financial account status.",
        };
    }
}