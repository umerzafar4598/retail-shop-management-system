"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import {
    createPurchaseDraftForShop,
    PurchaseDraftError,
} from "@/lib/purchases/purchase-drafts";

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

    const getString = (key: string) => {
        const value = formData.get(key);
        return typeof value === "string" ? value : "";
    };

    const getStringArray = (key: string) =>
        formData.getAll(key).map((value) =>
            typeof value === "string" ? value : "",
        );

    const variantIds = getStringArray("variantId");
    const quantities = getStringArray("quantity");
    const unitCosts = getStringArray("unitCost");

    try {
        if (
            variantIds.length !== quantities.length ||
            variantIds.length !== unitCosts.length
        ) {
            throw new PurchaseDraftError(
                "The purchase item rows are incomplete. Review the form and try again.",
            );
        }

        const created = await createPurchaseDraftForShop({
            shopId: shop.shopId,
            createdBy: session.user.id,
            purchase: {
                supplierId: getString("supplierId"),
                purchaseDate: getString("purchaseDate"),
                discountAmount: getString("discountAmount"),
                notes: getString("notes"),
                lines: variantIds.map((variantId, index) => ({
                    variantId,
                    quantity: quantities[index],
                    unitCost: unitCosts[index],
                })),
            },
        });

        revalidatePath("/purchases");

        return {
            status: "success",
            message: `Purchase draft ${created.documentNo} was saved successfully.`,
        };
    } catch (error) {
        if (error instanceof PurchaseDraftError) {
            return {
                status: "error",
                message: error.message,
            };
        }

        console.error("Create purchase draft failed:", error);

        return {
            status: "error",
            message: "The purchase draft could not be saved. Please try again.",
        };
    }
}