"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import {
    postPurchaseForShop,
    PurchaseReceiveError,
} from "@/lib/purchases/purchase-receiving";

export type ReceivePurchaseActionState = {
    status: "idle" | "success" | "error";
    message: string;
};

export async function receivePurchaseAction(
    _previousState: ReceivePurchaseActionState,
    formData: FormData,
): Promise<ReceivePurchaseActionState> {
    const shop = await requirePermission("products.update");
    const session = await requireSession();

    const getString = (key: string) => {
        const value = formData.get(key);
        return typeof value === "string" ? value : "";
    };

    const purchaseId = getString("purchaseId");
    const imeiLinesByItem: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
        if (key.startsWith("imei:") && typeof value === "string") {
            const itemId = key.slice("imei:".length);

            if (Object.hasOwn(imeiLinesByItem, itemId)) {
                return {
                    status: "error",
                    message: "Duplicate IMEI form field detected.",
                };
            }

            imeiLinesByItem[itemId] = value;
        }
    }

    try {
        const posted = await postPurchaseForShop({
            shopId: shop.shopId,
            postedBy: session.user.id,
            purchaseId,
            paidAmount: getString("paidAmount"),
            financialAccountId: getString("financialAccountId"),
            imeiLinesByItem,
        });

        revalidatePath("/purchases");
        revalidatePath(`/purchases/${purchaseId}`);
        revalidatePath("/inventory/stock");
        revalidatePath("/settings/finance/ledger");
        revalidatePath("/settings/finance/accounts");

        return {
            status: "success",
            message: `${posted.documentNo} was received and posted. ${posted.receivedUnitCount} unit(s) received; Rs ${posted.paidAmount} paid; Rs ${posted.payableAmount} remains payable.`,
        };
    } catch (error) {
        if (error instanceof PurchaseReceiveError) {
            return {
                status: "error",
                message: error.message,
            };
        }

        console.error("Receive purchase failed:", error);

        return {
            status: "error",
            message:
                "The purchase could not be posted. No partial receiving should be committed; check the server log if the problem continues.",
        };
    }
}