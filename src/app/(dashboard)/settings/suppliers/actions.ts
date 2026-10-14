"use server";

import { logUnexpectedActionError } from "@/lib/errors/safe-action-errors";
import { revalidatePath } from "next/cache";

import {
    createSupplierForShop,
    setSupplierActiveForShop,
    SupplierInputError,
} from "@/lib/suppliers/suppliers";
import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";

export type SupplierActionState = {
    status: "idle" | "success" | "error";
    message: string;
};

function getErrorMessage(error: unknown): string {
    if (error instanceof SupplierInputError) {
        return error.message;
    }

    logUnexpectedActionError("src/app/(dashboard)/settings/suppliers/actions.ts", error);
    return "The supplier could not be saved. Please try again.";
}

export async function createSupplierAction(
    _previousState: SupplierActionState,
    formData: FormData,
): Promise<SupplierActionState> {
    const shop = await requirePermission("suppliers.create");
    const session = await requireSession();

    try {
        await createSupplierForShop(shop.shopId, session.user.id, {
            name: String(formData.get("name") ?? ""),
            phone: String(formData.get("phone") ?? ""),
            address: String(formData.get("address") ?? ""),
            notes: String(formData.get("notes") ?? ""),
        });

        revalidatePath("/settings/suppliers");

        return {
            status: "success",
            message: "Supplier created successfully.",
        };
    } catch (error) {
        return {
            status: "error",
            message: getErrorMessage(error),
        };
    }
}

export async function setSupplierStatusAction(
    _previousState: SupplierActionState,
    formData: FormData,
): Promise<SupplierActionState> {
    const shop = await requirePermission("suppliers.update");
    const session = await requireSession();

    const supplierId = String(formData.get("supplierId") ?? "");
    const activeValue = String(formData.get("active") ?? "");

    if (activeValue !== "true" && activeValue !== "false") {
        return {
            status: "error",
            message: "Invalid supplier status.",
        };
    }

    const active = activeValue === "true";

    try {
        await setSupplierActiveForShop(
            shop.shopId,
            session.user.id,
            supplierId,
            active,
        );

        revalidatePath("/settings/suppliers");

        return {
            status: "success",
            message: active
                ? "Supplier reactivated."
                : "Supplier deactivated.",
        };
    } catch (error) {
        return {
            status: "error",
            message: getErrorMessage(error),
        };
    }
}