import {
    PurchaseDraftError,
    type PurchaseDraftInput,
} from "@/lib/purchases/purchase-drafts";

export function readPurchaseInput(formData: FormData): PurchaseDraftInput {
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

    if (
        variantIds.length !== quantities.length ||
        variantIds.length !== unitCosts.length
    ) {
        throw new PurchaseDraftError(
            "The purchase item rows are incomplete. Review the form and try again.",
        );
    }

    return {
        supplierId: getString("supplierId"),
        purchaseDate: getString("purchaseDate"),
        discountAmount: getString("discountAmount"),
        notes: getString("notes"),
        lines: variantIds.map((variantId, index) => ({
            variantId,
            quantity: quantities[index],
            unitCost: unitCosts[index],
        })),
    };
}
