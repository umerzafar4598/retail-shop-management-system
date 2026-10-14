"use server";

import { logUnexpectedActionError } from "@/lib/errors/safe-action-errors";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";

import { OpeningBalanceError, setOpeningBalance } from "@/lib/finance/opening-balances";

const OPENING_BALANCES_PATH =
    "/settings/finance/opening-balances";

type ActionResult = {
    success: boolean;
    message: string;
};

export async function setOpeningBalanceAction(
    financialAccountId: string,
    amount: string,
): Promise<ActionResult> {
    await requirePermission("financial_accounts.opening_balance");

    try {
        await setOpeningBalance(
            financialAccountId,
            amount,
        );

        revalidatePath(OPENING_BALANCES_PATH);
        revalidatePath("/settings/finance/accounts");
        revalidatePath("/dashboard");

        return {
            success: true,
            message:
                "Opening balance recorded successfully.",
        };
    } catch (error) {
        if (error instanceof OpeningBalanceError) {
            return { success: false, message: error.message };
        }
        logUnexpectedActionError("src/app/(dashboard)/settings/finance/opening-balances/actions.ts", error);
        return { success: false, message: "The opening balance could not be recorded. Please try again." };
    }
}