"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { ExpenseError, reverseExpenseForShop } from "@/lib/expenses/expenses";

export type ExpenseReversalActionState = { status: "idle" | "success" | "error"; message: string; reversalDocumentNo?: string; replacementDocumentNo?: string };
const read = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function reverseExpenseAction(_previous: ExpenseReversalActionState, formData: FormData): Promise<ExpenseReversalActionState> {
  const shop = await requirePermission("expenses.reverse");
  const session = await requireSession();
  const expenseId = read(formData, "expenseId");
  const mode = read(formData, "mode");
  if (!(mode === "REVERSE_ONLY" || mode === "CORRECT")) return { status: "error", message: "Choose a valid reversal or correction action." };
  try {
    const result = await reverseExpenseForShop({
      shopId: shop.shopId,
      actorUserId: session.user.id,
      expenseId,
      reason: read(formData, "reason"),
      replacement: mode === "CORRECT" ? {
        categoryId: read(formData, "replacementCategoryId"),
        financialAccountId: read(formData, "replacementFinancialAccountId"),
        amount: read(formData, "replacementAmount"),
        expenseDate: read(formData, "replacementExpenseDate"),
        payee: read(formData, "replacementPayee"),
        notes: read(formData, "replacementNotes"),
      } : undefined,
    });
    revalidatePath("/expenses");
    revalidatePath(`/expenses/${expenseId}/reverse`);
    revalidatePath("/settings/finance/ledger");
    revalidatePath("/settings/finance/accounts");
    revalidatePath("/dashboard");
    revalidatePath("/cash-sessions");
    return { status: "success", reversalDocumentNo: result.reversalDocumentNo, replacementDocumentNo: result.replacementDocumentNo ?? undefined, message: result.replacementDocumentNo
      ? `Expense ${result.documentNo} was reversed with ${result.reversalDocumentNo}, and corrected replacement ${result.replacementDocumentNo} was posted in the same database transaction. The original history remains intact.`
      : `Expense ${result.documentNo} was reversed with ${result.reversalDocumentNo}. The original record and journal remain in history. If a real expense still needs to be recorded, add the correct amount as a new expense document.` };
  } catch (error) {
    if (error instanceof ExpenseError) return { status: "error", message: error.message };
    console.error("Reverse expense failed:", error);
    return { status: "error", message: "The expense could not be reversed. No partial reversal should be committed; check the server log if the problem continues." };
  }
}
