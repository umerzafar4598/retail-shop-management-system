"use server";

import { revalidatePath } from "next/cache";

import {
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
    try {
        const result = await createProduct(input);

        revalidatePath(PRODUCTS_PATH);

        return {
            success: true,
            message: `Product created successfully. Variant ${result.variantId} is ready for inventory.`,
        };
    } catch (error) {
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Failed to create the product.",
        };
    }
}

export async function setProductStatusAction(
    productId: string,
    active: boolean,
): Promise<ActionResult> {
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
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Failed to change product status.",
        };
    }
}