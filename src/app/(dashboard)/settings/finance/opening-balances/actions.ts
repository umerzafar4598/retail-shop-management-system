"use server";

import { revalidatePath } from "next/cache";

import { setOpeningBalance } from "@/lib/finance/opening-balances";

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
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Failed to record the opening balance.",
        };
    }
}