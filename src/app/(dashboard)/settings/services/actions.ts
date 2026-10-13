"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { createServiceTypeForShop, ShopServiceError, updateServiceTypeForShop, type ServiceDirection } from "@/lib/shop-services/service-transactions";

export type ServiceTypeActionState = { status: "idle" | "success" | "error"; message: string };
const read = (formData: FormData, key: string) => { const value = formData.get(key); return typeof value === "string" ? value : ""; };

export async function createServiceTypeAction(_previous: ServiceTypeActionState, formData: FormData): Promise<ServiceTypeActionState> {
  const shop = await requirePermission("services.manage_types");
  const session = await requireSession();
  try {
    await createServiceTypeForShop({
      shopId: shop.shopId,
      actorUserId: session.user.id,
      code: read(formData, "code"),
      name: read(formData, "name"),
      category: read(formData, "category"),
      direction: read(formData, "direction") as ServiceDirection,
      defaultFee: read(formData, "defaultFee"),
    });
    revalidatePath("/settings/services");
    revalidatePath("/services");
    return { status: "success", message: "Service type created." };
  } catch (error) {
    if (error instanceof ShopServiceError) return { status: "error", message: error.message };
    console.error("Create service type failed:", error);
    return { status: "error", message: "Service type could not be created. Check its code and the server log." };
  }
}

export async function updateServiceTypeAction(_previous: ServiceTypeActionState, formData: FormData): Promise<ServiceTypeActionState> {
  const shop = await requirePermission("services.manage_types");
  const session = await requireSession();
  try {
    const activeValue = read(formData, "active");
    await updateServiceTypeForShop({
      shopId: shop.shopId,
      actorUserId: session.user.id,
      serviceTypeId: read(formData, "serviceTypeId"),
      name: read(formData, "name"),
      category: read(formData, "category"),
      direction: read(formData, "direction") as ServiceDirection,
      defaultFee: read(formData, "defaultFee"),
      active: activeValue === "true",
    });
    revalidatePath("/settings/services");
    revalidatePath("/services");
    return { status: "success", message: "Service type settings saved." };
  } catch (error) {
    if (error instanceof ShopServiceError) return { status: "error", message: error.message };
    console.error("Update service type failed:", error);
    return { status: "error", message: "Service type settings could not be saved. Check the server log." };
  }
}
