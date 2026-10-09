"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import {
    createPurchaseDraftForShop,
    PurchaseDraftError,
} from "@/lib/purchases/purchase-drafts";
import { readPurchaseInput } from "@/lib/purchases/purchase-form-input";

export type PurchaseActionState = {
    status: "idle" | "success" | "error";
    message: string;
};

export async function createPurchaseDraftAction(
    _previousState: PurchaseActionState,
    formData: FormData,
): Promise<PurchaseActionState> {
    const shop = await requirePermission("products.create");
    const session = await requireSession();

    try {
        const created = await createPurchaseDraftForShop({
            shopId: shop.shopId,
            createdBy: session.user.id,
            purchase: readPurchaseInput(formData),
        });

        revalidatePath("/purchases");

        return {
            status: "success",
            message: `Purchase draft ${created.documentNo} was saved successfully.`,
        };
    } catch (error) {
        if (error instanceof PurchaseDraftError) {
            return { status: "error", message: error.message };
        }

        console.error("Create purchase draft failed:", error);
        return {
            status: "error",
            message: "The purchase draft could not be saved. Please try again.",
        };
    }
}
