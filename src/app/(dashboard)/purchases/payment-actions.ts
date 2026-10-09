"use server";

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
    const shop = await requirePermission("products.update");
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

        console.error("Supplier payment failed:", error);

        return {
            status: "error",
            message: "The supplier payment could not be recorded. Please try again.",
        };
    }
}