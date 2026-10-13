"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { createExpenseForShop, ExpenseError } from "@/lib/expenses/expenses";

export type ExpenseActionState = { status: "idle" | "success" | "error"; message: string; expenseId?: string };
const read = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function createExpenseAction(_previous: ExpenseActionState, formData: FormData): Promise<ExpenseActionState> {
  const shop = await requirePermission("expenses.create");
  const session = await requireSession();
  try {
    const result = await createExpenseForShop({
      shopId: shop.shopId,
      createdBy: session.user.id,
      categoryId: read(formData, "categoryId"),
      financialAccountId: read(formData, "financialAccountId"),
      amount: read(formData, "amount"),
      expenseDate: read(formData, "expenseDate"),
      payee: read(formData, "payee"),
      notes: read(formData, "notes"),
    });
    revalidatePath("/expenses");
    revalidatePath("/settings/expenses");
    revalidatePath("/settings/finance/ledger");
    revalidatePath("/settings/finance/accounts");
    revalidatePath("/cash-sessions");
    revalidatePath("/dashboard");
    return { status: "success", expenseId: result.id, message: `Expense ${result.documentNo} recorded: Rs ${result.amount} for ${result.categoryName}, paid from ${result.financialAccountName}.` };
  } catch (error) {
    if (error instanceof ExpenseError) return { status: "error", message: error.message };
    console.error("Create expense failed:", error);
    return { status: "error", message: "The expense could not be recorded. No partial journal should be committed; check the server log if the problem continues." };
  }
}
