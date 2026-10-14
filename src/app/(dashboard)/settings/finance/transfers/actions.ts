"use server";

import { logUnexpectedActionError } from "@/lib/errors/safe-action-errors";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";

import { AccountTransferError } from "@/lib/finance/account-transfer-core";

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
    await requirePermission("account_transfers.create");

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
        if (error instanceof AccountTransferError) {
            return { success: false, message: error.message };
        }
        logUnexpectedActionError("src/app/(dashboard)/settings/finance/transfers/actions.ts", error);
        return { success: false, message: "The account transfer could not be completed. Please try again." };
    }
}