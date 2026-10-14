"use server";

import { logUnexpectedActionError } from "@/lib/errors/safe-action-errors";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { createSaleExchangeForShop, SaleExchangeError } from "@/lib/pos/exchanges";

export type SaleExchangeActionState = { status: "idle" | "success" | "error"; message: string; replacementSaleId?: string; returnId?: string };

export async function createSaleExchangeAction(_previousState: SaleExchangeActionState, formData: FormData): Promise<SaleExchangeActionState> {
  const shop = await requirePermission("sales.exchange");
  const session = await requireSession();
  const getString = (key: string) => { const value = formData.get(key); return typeof value === "string" ? value : ""; };
  const originalSaleId = getString("originalSaleId");
  try {
    const result = await createSaleExchangeForShop({
      shopId: shop.shopId,
      createdBy: session.user.id,
      originalSaleId,
      reason: getString("reason"),
      returnItemsJson: getString("returnItemsJson"),
      cartJson: getString("cartJson"),
      discountAmount: getString("discountAmount"),
      paymentAllocationsJson: getString("paymentAllocationsJson"),
      customerId: getString("customerId"),
      allowCreditBalance: getString("allowCreditBalance") === "true",
    });
    revalidatePath("/sales");
    revalidatePath(`/sales/${originalSaleId}`);
    revalidatePath(`/sales/${result.replacementSaleId}`);
    revalidatePath("/customers");
    if (result.customerId) revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/inventory/stock");
    revalidatePath("/settings/finance/ledger");
    revalidatePath("/settings/finance/accounts");
    return {
      status: "success",
      replacementSaleId: result.replacementSaleId,
      returnId: result.returnId,
      message: `Exchange ${result.returnDocumentNo} → ${result.replacementSaleDocumentNo} completed. Exchange credit ${`Rs ${result.exchangeValue}`}; replacement total Rs ${result.replacementSaleTotal}; additional payment Rs ${result.cashReceived}; remaining customer balance Rs ${result.outstandingAmount}.`,
    };
  } catch (error) {
    if (error instanceof SaleExchangeError) return { status: "error", message: error.message };
    logUnexpectedActionError("src/app/(dashboard)/sales/[saleId]/exchange-actions.ts", error);
    return { status: "error", message: "The exchange could not be completed. No changes should be committed; check the server log if the problem continues." };
  }
}
