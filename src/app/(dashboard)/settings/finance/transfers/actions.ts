"use server";

import { revalidatePath } from "next/cache";

import {
    createAccountTransfer,
    type CreateAccountTransferInput,
} from "@/lib/finance/account-transfers";

const TRANSFERS_PATH =
    "/settings/finance/transfers";

type ActionResult = {
    success: boolean;
    message: string;
};

export async function createAccountTransferAction(
    input: CreateAccountTransferInput,
): Promise<ActionResult> {
    try {
        const result =
            await createAccountTransfer(input);

        revalidatePath(TRANSFERS_PATH);
        revalidatePath("/settings/finance/accounts");
        revalidatePath(
            "/settings/finance/opening-balances",
        );
        revalidatePath("/dashboard");

        return {
            success: true,
            message: `Transfer ${result.documentNo} completed successfully.`,
        };
    } catch (error) {
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Failed to complete the account transfer.",
        };
    }
}