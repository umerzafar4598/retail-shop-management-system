"use server";

import { logUnexpectedActionError } from "@/lib/errors/safe-action-errors";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";

import {
    FinancialAccountError,
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
    await requirePermission("financial_accounts.create");

    try {
        await createFinancialAccount(input);

        revalidatePath(FINANCE_ACCOUNTS_PATH);

        return {
            success: true,
            message: `${input.name.trim()} was created successfully.`,
        };
    } catch (error) {
        if (error instanceof FinancialAccountError) {
            return { success: false, message: error.message };
        }
        logUnexpectedActionError("src/app/(dashboard)/settings/finance/accounts/actions.ts", error);
        return { success: false, message: "The financial account could not be created. Please try again." };
    }
}

export async function updateFinancialAccountAction(
    input: UpdateFinancialAccountInput,
): Promise<FinanceAccountActionResult> {
    await requirePermission("financial_accounts.update");

    try {
        await updateFinancialAccount(input);

        revalidatePath(FINANCE_ACCOUNTS_PATH);

        return {
            success: true,
            message: `${input.name.trim()} was updated successfully.`,
        };
    } catch (error) {
        if (error instanceof FinancialAccountError) {
            return { success: false, message: error.message };
        }
        logUnexpectedActionError("src/app/(dashboard)/settings/finance/accounts/actions.ts", error);
        return { success: false, message: "The financial account could not be updated. Please try again." };
    }
}

export async function setFinancialAccountStatusAction(
    financialAccountId: string,
    isActive: boolean,
): Promise<FinanceAccountActionResult> {
    await requirePermission("financial_accounts.deactivate");

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
        if (error instanceof FinancialAccountError) {
            return { success: false, message: error.message };
        }
        logUnexpectedActionError("src/app/(dashboard)/settings/finance/accounts/actions.ts", error);
        return { success: false, message: "The financial account status could not be changed. Please try again." };
    }
}