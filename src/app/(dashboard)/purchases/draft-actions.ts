"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import {
    cancelPurchaseDraftForShop,
    PurchaseDraftError,
    updatePurchaseDraftForShop,
} from "@/lib/purchases/purchase-drafts";
import type { PurchaseActionState } from "./actions";
import { readPurchaseInput } from "@/lib/purchases/purchase-form-input";

export async function updatePurchaseDraftAction(
    _previousState: PurchaseActionState,
    formData: FormData,
): Promise<PurchaseActionState> {
    const shop = await requirePermission("products.update");
    const session = await requireSession();
    const purchaseIdValue = formData.get("purchaseId");
    const purchaseId = typeof purchaseIdValue === "string" ? purchaseIdValue : "";

    let updated: Awaited<ReturnType<typeof updatePurchaseDraftForShop>>;

    try {
        updated = await updatePurchaseDraftForShop({
            shopId: shop.shopId,
            updatedBy: session.user.id,
            purchaseId,
            purchase: readPurchaseInput(formData),
        });
    } catch (error) {
        if (error instanceof PurchaseDraftError) {
            return { status: "error", message: error.message };
        }

        console.error("Update purchase draft failed:", error);
        return {
            status: "error",
            message: "The purchase draft could not be updated. Please try again.",
        };
    }

    revalidatePath("/purchases");
    revalidatePath(`/purchases/${updated.id}`);
    revalidatePath(`/purchases/${updated.id}/edit`);
    redirect(`/purchases/${updated.id}`);
}

export async function cancelPurchaseDraftAction(
    _previousState: PurchaseActionState,
    formData: FormData,
): Promise<PurchaseActionState> {
    const shop = await requirePermission("products.update");
    const session = await requireSession();
    const purchaseIdValue = formData.get("purchaseId");
    const purchaseId = typeof purchaseIdValue === "string" ? purchaseIdValue : "";

    let cancelled: Awaited<ReturnType<typeof cancelPurchaseDraftForShop>>;

    try {
        cancelled = await cancelPurchaseDraftForShop({
            shopId: shop.shopId,
            cancelledBy: session.user.id,
            purchaseId,
        });
    } catch (error) {
        if (error instanceof PurchaseDraftError) {
            return { status: "error", message: error.message };
        }

        console.error("Cancel purchase draft failed:", error);
        return {
            status: "error",
            message: "The purchase draft could not be cancelled. Please try again.",
        };
    }

    revalidatePath("/purchases");
    revalidatePath(`/purchases/${cancelled.id}`);
    redirect(`/purchases/${cancelled.id}`);
}
