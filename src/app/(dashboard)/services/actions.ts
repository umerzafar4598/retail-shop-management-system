"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { createServiceTransactionForShop, ShopServiceError, transitionServiceTransactionForShop } from "@/lib/shop-services/service-transactions";

export type ServiceActionState = { status: "idle" | "success" | "error"; message: string; serviceId?: string };

const read = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function createServiceTransactionAction(_previous: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  const shop = await requirePermission("services.create");
  const session = await requireSession();
  try {
    const result = await createServiceTransactionForShop({
      shopId: shop.shopId,
      createdBy: session.user.id,
      serviceTypeId: read(formData, "serviceTypeId"),
      customerId: read(formData, "customerId"),
      principalAmount: read(formData, "principalAmount"),
      serviceFee: read(formData, "serviceFee"),
      providerAccountId: read(formData, "providerAccountId"),
      settlementAccountId: read(formData, "settlementAccountId"),
      externalReference: read(formData, "externalReference"),
      notes: read(formData, "notes"),
    });
    revalidatePath("/services");
    revalidatePath("/settings/finance/ledger");
    revalidatePath("/settings/finance/accounts");
    return { status: "success", serviceId: result.id, message: `Service ${result.documentNo} recorded as PENDING. The customer/provider funds are held in Service Clearing until the service is completed or refunded.` };
  } catch (error) {
    if (error instanceof ShopServiceError) return { status: "error", message: error.message };
    console.error("Create service transaction failed:", error);
    return { status: "error", message: "The service could not be recorded. No partial transaction should be committed; check the server log if the problem continues." };
  }
}

export async function transitionServiceTransactionAction(_previous: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  const serviceId = read(formData, "serviceId");
  const rawAction = read(formData, "action");
  if (!(rawAction === "PROCESSING" || rawAction === "COMPLETED" || rawAction === "FAILED" || rawAction === "CANCELLED")) {
    return { status: "error", message: "Choose a valid service status action." };
  }
  const requiredPermission = rawAction === "PROCESSING"
    ? "services.process"
    : rawAction === "COMPLETED"
      ? "services.complete"
      : "services.cancel";
  const shop = await requirePermission(requiredPermission);
  const session = await requireSession();
  try {
    const result = await transitionServiceTransactionForShop({
      shopId: shop.shopId,
      actorUserId: session.user.id,
      serviceId,
      action: rawAction,
      externalReference: read(formData, "externalReference"),
      accountId: read(formData, "accountId"),
      reason: read(formData, "reason"),
    });
    revalidatePath("/services");
    revalidatePath(`/services/${serviceId}`);
    revalidatePath("/settings/finance/ledger");
    revalidatePath("/settings/finance/accounts");
    revalidatePath("/settings/services");
    const message = rawAction === "COMPLETED"
      ? `Service ${result.documentNo} marked COMPLETED. The service clearing journal has been released to the provider/payout account and fee revenue.`
      : rawAction === "PROCESSING"
        ? `Service ${result.documentNo} marked PROCESSING.`
        : `Service ${result.documentNo} marked ${result.serviceStatus}; refund of Rs ${"refundAmount" in result ? result.refundAmount : "0.00"} posted${"refundAccountName" in result ? ` from ${result.refundAccountName}` : ""}.`;
    return { status: "success", serviceId, message };
  } catch (error) {
    if (error instanceof ShopServiceError) return { status: "error", message: error.message };
    console.error("Update service transaction failed:", error);
    return { status: "error", message: "The service status could not be changed. Check the server log if the problem continues." };
  }
}
