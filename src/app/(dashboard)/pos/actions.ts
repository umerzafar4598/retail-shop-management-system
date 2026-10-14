"use server";

import { logUnexpectedActionError } from "@/lib/errors/safe-action-errors";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { completeSaleForShop, PosCheckoutError } from "@/lib/pos/checkout";

export type PosCheckoutActionState = {
  status: "idle" | "success" | "error";
  message: string;
  saleId?: string;
  documentNo?: string;
};

export async function completePosSaleAction(
  _previousState: PosCheckoutActionState,
  formData: FormData,
): Promise<PosCheckoutActionState> {
  const shop = await requirePermission("sales.create");
  const session = await requireSession();
  const getString = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };

  try {
    const sale = await completeSaleForShop({
      shopId: shop.shopId,
      createdBy: session.user.id,
      cartJson: getString("cartJson"),
      discountAmount: getString("discountAmount"),
      paymentAllocationsJson: getString("paymentAllocationsJson"),
      customerId: getString("customerId") || null,
      allowCreditBalance: getString("allowCreditBalance") === "true",
    });

    revalidatePath("/pos");
    revalidatePath("/sales");
    revalidatePath(`/sales/${sale.id}`);
    revalidatePath("/inventory/stock");
    revalidatePath("/settings/finance/ledger");
    revalidatePath("/settings/finance/accounts");
    revalidatePath("/customers");
    if (sale.customerId) revalidatePath(`/customers/${sale.customerId}`);

    return {
      status: "success",
      message: `${sale.documentNo} completed. ${sale.totalUnits} unit(s) sold for Rs ${sale.totalAmount}; received Rs ${sale.amountReceived}; outstanding Rs ${sale.outstandingAmount}.`,
      saleId: sale.id,
      documentNo: sale.documentNo,
    };
  } catch (error) {
    if (error instanceof PosCheckoutError) {
      return { status: "error", message: error.message };
    }
    logUnexpectedActionError("src/app/(dashboard)/pos/actions.ts", error);
    return {
      status: "error",
      message: "The sale could not be completed. No partial checkout should be committed. Check the server log if the problem continues.",
    };
  }
}
