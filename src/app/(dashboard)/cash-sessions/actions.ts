"use server";

import { logUnexpectedActionError } from "@/lib/errors/safe-action-errors";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import {
  acknowledgeCashDiscrepancyForShop,
  CashSessionError,
  closeCashSessionForShop,
  openCashSessionForShop,
} from "@/lib/cash/cash-sessions";

export type CashSessionActionState = { status: "idle" | "success" | "error"; message: string };
const read = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

function revalidateCashPages() {
  revalidatePath("/cash-sessions");
  revalidatePath("/expenses");
  revalidatePath("/settings/finance/ledger");
  revalidatePath("/settings/finance/accounts");
  revalidatePath("/dashboard");
}

export async function openCashSessionAction(_previous: CashSessionActionState, formData: FormData): Promise<CashSessionActionState> {
  const shop = await requirePermission("cash_sessions.open");
  const session = await requireSession();
  try {
    const result = await openCashSessionForShop({
      shopId: shop.shopId,
      actorUserId: session.user.id,
      financialAccountId: read(formData, "financialAccountId"),
      openingAmount: read(formData, "openingAmount"),
    });
    revalidateCashPages();
    return { status: "success", message: `Cash session opened for ${result.accountName}. Opening physical cash: Rs ${result.openingAmount}; ledger baseline: Rs ${result.openingLedgerBalance}.` };
  } catch (error) {
    if (error instanceof CashSessionError) return { status: "error", message: error.message };
    logUnexpectedActionError("src/app/(dashboard)/cash-sessions/actions.ts", error);
    return { status: "error", message: "The cash session could not be opened. No partial session should be committed; check the server logs if this continues." };
  }
}

export async function closeCashSessionAction(_previous: CashSessionActionState, formData: FormData): Promise<CashSessionActionState> {
  const shop = await requirePermission("cash_sessions.close");
  const session = await requireSession();
  try {
    const result = await closeCashSessionForShop({
      shopId: shop.shopId,
      actorUserId: session.user.id,
      cashSessionId: read(formData, "cashSessionId"),
      actualClosingAmount: read(formData, "actualClosingAmount"),
    });
    revalidateCashPages();
    return result.status === "CLOSED"
      ? { status: "success", message: `Cash session closed. Expected Rs ${result.expectedClosingAmount}; counted Rs ${result.actualClosingAmount}; difference Rs ${result.difference}.` }
      : { status: "success", message: `Count recorded; discrepancy review is required. Expected Rs ${result.expectedClosingAmount}, counted Rs ${result.actualClosingAmount}, difference Rs ${result.difference}. Add an acknowledgement note before opening another session for this drawer.` };
  } catch (error) {
    if (error instanceof CashSessionError) return { status: "error", message: error.message };
    logUnexpectedActionError("src/app/(dashboard)/cash-sessions/actions.ts", error);
    return { status: "error", message: "The cash session could not be closed. Check the server logs if this continues." };
  }
}

export async function acknowledgeCashDiscrepancyAction(_previous: CashSessionActionState, formData: FormData): Promise<CashSessionActionState> {
  const shop = await requirePermission("cash_sessions.reconcile");
  const session = await requireSession();
  try {
    const result = await acknowledgeCashDiscrepancyForShop({
      shopId: shop.shopId,
      actorUserId: session.user.id,
      cashSessionId: read(formData, "cashSessionId"),
      reason: read(formData, "reason"),
    });
    revalidateCashPages();
    return { status: "success", message: `Discrepancy reviewed for ${result.accountName}. Recorded difference remains Rs ${result.difference}; no automatic accounting adjustment was posted.` };
  } catch (error) {
    if (error instanceof CashSessionError) return { status: "error", message: error.message };
    logUnexpectedActionError("src/app/(dashboard)/cash-sessions/actions.ts", error);
    return { status: "error", message: "The discrepancy acknowledgement could not be saved." };
  }
}
