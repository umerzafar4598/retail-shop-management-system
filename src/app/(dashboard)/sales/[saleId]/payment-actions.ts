"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { CustomerPaymentError, recordCustomerPaymentForSaleForShop } from "@/lib/pos/customer-payments";

export type SalePaymentActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function recordSalePaymentAction(
  _previousState: SalePaymentActionState,
  formData: FormData,
): Promise<SalePaymentActionState> {
  const shop = await requirePermission("sales.collect_payment");
  const session = await requireSession();
  const getString = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };

  try {
    const result = await recordCustomerPaymentForSaleForShop({
      shopId: shop.shopId,
      createdBy: session.user.id,
      saleId: getString("saleId"),
      financialAccountId: getString("financialAccountId"),
      amount: getString("amount"),
    });
    revalidatePath("/sales");
    revalidatePath(`/sales/${getString("saleId")}`);
    revalidatePath("/customers");
    revalidatePath(`/customers/${result.customerId}`);
    revalidatePath("/settings/finance/ledger");
    revalidatePath("/settings/finance/accounts");
    return {
      status: "success",
      message: `Recorded Rs ${result.amount} into ${result.paymentAccountName}. Remaining balance for ${result.documentNo}: Rs ${result.outstandingAfter}.`,
    };
  } catch (error) {
    if (error instanceof CustomerPaymentError) return { status: "error", message: error.message };
    console.error("Record customer payment failed:", error);
    return { status: "error", message: "The customer payment could not be recorded. Check the server log if the problem continues." };
  }
}
