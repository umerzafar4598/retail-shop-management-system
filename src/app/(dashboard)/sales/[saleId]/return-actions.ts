"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { createSaleReturnForShop, SaleReturnError } from "@/lib/pos/returns";

export type SaleReturnActionState = { status: "idle" | "success" | "error"; message: string };

export async function createSaleReturnAction(_previousState: SaleReturnActionState, formData: FormData): Promise<SaleReturnActionState> {
  const shop = await requirePermission("products.update");
  const session = await requireSession();
  const getString = (key: string) => { const value = formData.get(key); return typeof value === "string" ? value : ""; };
  const saleId = getString("saleId");
  try {
    const result = await createSaleReturnForShop({
      shopId: shop.shopId,
      createdBy: session.user.id,
      saleId,
      reason: getString("reason"),
      itemsJson: getString("itemsJson"),
      refundFinancialAccountId: getString("refundFinancialAccountId"),
    });
    revalidatePath("/sales");
    revalidatePath(`/sales/${saleId}`);
    revalidatePath("/inventory/stock");
    revalidatePath("/settings/finance/ledger");
    revalidatePath("/settings/finance/accounts");
    revalidatePath("/customers");
    if (result.customerId) revalidatePath(`/customers/${result.customerId}`);
    return {
      status: "success",
      message: `Return ${result.documentNo} recorded. Return value Rs ${result.returnedValue}; cash refund Rs ${result.cashRefund}; customer receivable reduced by Rs ${result.receivableReduction}; restocked item cost reversed Rs ${result.restockCostReversed}.`,
    };
  } catch (error) {
    if (error instanceof SaleReturnError) return { status: "error", message: error.message };
    console.error("Create sale return failed:", error);
    return { status: "error", message: "The return could not be recorded. No changes should be committed; check the server log if the problem continues." };
  }
}
