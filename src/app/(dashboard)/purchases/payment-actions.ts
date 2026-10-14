"use server";

import { logUnexpectedActionError } from "@/lib/errors/safe-action-errors";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import {
    recordSupplierPaymentForShop,
    SupplierPaymentError,
} from "@/lib/purchases/supplier-payments";

export type SupplierPaymentActionState = {
    status: "idle" | "success" | "error";
    message: string;
};

export async function recordSupplierPaymentAction(
    _previousState: SupplierPaymentActionState,
    formData: FormData,
): Promise<SupplierPaymentActionState> {
    const shop = await requirePermission("purchases.record_payment");
    const session = await requireSession();

    const getString = (key: string) => {
        const value = formData.get(key);
        return typeof value === "string" ? value : "";
    };

    const purchaseId = getString("purchaseId");

    try {
        const result = await recordSupplierPaymentForShop({
            shopId: shop.shopId,
            createdBy: session.user.id,
            purchaseId,
            financialAccountId: getString("financialAccountId"),
            amount: getString("amount"),
        });

        revalidatePath("/purchases");
        revalidatePath(`/purchases/${purchaseId}`);
        revalidatePath("/settings/finance/ledger");
        revalidatePath("/settings/finance/accounts");

        return {
            status: "success",
            message:
                `Payment of Rs ${result.amountPaid} recorded for ${result.documentNo}. ` +
                `Remaining payable: Rs ${result.outstandingAfter}.`,
        };
    } catch (error) {
        if (error instanceof SupplierPaymentError) {
            return {
                status: "error",
                message: error.message,
            };
        }

        logUnexpectedActionError("src/app/(dashboard)/purchases/payment-actions.ts", error);

        return {
            status: "error",
            message: "The supplier payment could not be recorded. Please try again.",
        };
    }
}