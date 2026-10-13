"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { CashDrawerSettingsError, saveCashDrawerDefaultsForShop } from "@/lib/cash/cash-drawer-settings";

export type CashDrawerSettingsActionState = { status: "idle" | "success" | "error"; message: string };
const read = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function saveCashDrawerDefaultsAction(_previous: CashDrawerSettingsActionState, formData: FormData): Promise<CashDrawerSettingsActionState> {
  const shop = await requirePermission("cash_drawers.manage");
  const session = await requireSession();
  try {
    const result = await saveCashDrawerDefaultsForShop({
      shopId: shop.shopId,
      actorUserId: session.user.id,
      retailCashAccountId: read(formData, "retailCashAccountId"),
      serviceCashAccountId: read(formData, "serviceCashAccountId"),
    });
    for (const path of [
      "/settings/cash-drawers", "/cash-sessions", "/pos", "/services", "/expenses",
      "/settings/finance/accounts", "/dashboard",
    ]) revalidatePath(path);
    const retail = result.retailAccountName ?? "not assigned";
    const services = result.servicesAccountName ?? "not assigned";
    return { status: "success", message: `Default drawers saved. Retail: ${retail}. Services: ${services}.` };
  } catch (error) {
    if (error instanceof CashDrawerSettingsError) return { status: "error", message: error.message };
    console.error("Save cash drawer defaults failed:", error);
    return { status: "error", message: "Cash drawer defaults could not be saved. No partial settings should be committed; check the server log if this continues." };
  }
}
