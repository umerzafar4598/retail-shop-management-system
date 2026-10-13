"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import {
  createExpenseCategoryForShop,
  ExpenseError,
  setExpenseCategoryActiveForShop,
} from "@/lib/expenses/expenses";

export type ExpenseCategoryActionState = { status: "idle" | "success" | "error"; message: string };
const read = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function createExpenseCategoryAction(_previous: ExpenseCategoryActionState, formData: FormData): Promise<ExpenseCategoryActionState> {
  const shop = await requirePermission("products.update");
  const session = await requireSession();
  try {
    await createExpenseCategoryForShop({
      shopId: shop.shopId,
      actorUserId: session.user.id,
      name: read(formData, "name"),
      ledgerAccountId: read(formData, "ledgerAccountId"),
    });
    revalidatePath("/settings/expenses");
    revalidatePath("/expenses");
    return { status: "success", message: "Expense category created and mapped to the selected ledger account." };
  } catch (error) {
    if (error instanceof ExpenseError) return { status: "error", message: error.message };
    console.error("Create expense category failed:", error);
    return { status: "error", message: "The expense category could not be created." };
  }
}

export async function setExpenseCategoryActiveAction(_previous: ExpenseCategoryActionState, formData: FormData): Promise<ExpenseCategoryActionState> {
  const shop = await requirePermission("products.update");
  const session = await requireSession();
  const rawActive = read(formData, "active");
  if (rawActive !== "true" && rawActive !== "false") return { status: "error", message: "Choose a valid category status." };
  try {
    await setExpenseCategoryActiveForShop({
      shopId: shop.shopId,
      actorUserId: session.user.id,
      categoryId: read(formData, "categoryId"),
      active: rawActive === "true",
    });
    revalidatePath("/settings/expenses");
    revalidatePath("/expenses");
    return { status: "success", message: rawActive === "true" ? "Expense category reactivated." : "Expense category deactivated. Historical expenses are unchanged." };
  } catch (error) {
    if (error instanceof ExpenseError) return { status: "error", message: error.message };
    console.error("Update expense category failed:", error);
    return { status: "error", message: "The expense category status could not be changed." };
  }
}
