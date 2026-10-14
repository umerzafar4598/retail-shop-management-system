"use server";

import { logUnexpectedActionError } from "@/lib/errors/safe-action-errors";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";

import {
    CatalogError,
    createProduct,
    setProductStatus,
    type CreateProductInput,
} from "@/lib/inventory/catalog";

const PRODUCTS_PATH = "/inventory/products";

type ActionResult = {
    success: boolean;
    message: string;
};

export async function createProductAction(
    input: CreateProductInput,
): Promise<ActionResult> {
    await requirePermission("products.create");

    try {
        const result = await createProduct(input);

        revalidatePath(PRODUCTS_PATH);

        return {
            success: true,
            message: `Product created successfully. Variant ${result.variantId} is ready for inventory.`,
        };
    } catch (error) {
        if (error instanceof CatalogError) {
            return { success: false, message: error.message };
        }
        logUnexpectedActionError("src/app/(dashboard)/inventory/products/actions.ts", error);
        return { success: false, message: "The product could not be created. Please try again." };
    }
}

export async function setProductStatusAction(
    productId: string,
    active: boolean,
): Promise<ActionResult> {
    await requirePermission("products.update");

    try {
        await setProductStatus(
            productId,
            active,
        );

        revalidatePath(PRODUCTS_PATH);

        return {
            success: true,
            message: active
                ? "Product reactivated successfully."
                : "Product deactivated successfully.",
        };
    } catch (error) {
        if (error instanceof CatalogError) {
            return { success: false, message: error.message };
        }
        logUnexpectedActionError("src/app/(dashboard)/inventory/products/actions.ts", error);
        return { success: false, message: "The product status could not be changed. Please try again." };
    }
}