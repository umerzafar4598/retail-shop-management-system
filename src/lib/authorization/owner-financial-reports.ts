import "server-only";

import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/authorization";

/**
 * Financial/management reports are restricted to the Owner role.
 * The permission check is necessary but not sufficient: this explicit role
 * check also blocks access if a stale seed accidentally grants reports.view
 * to Manager or another role.
 */
export async function requireOwnerFinancialReportAccess(expectedShopId?: string) {
  const context = await requirePermission("reports.view");

  if (context.roleName.trim().toLocaleLowerCase("en-US") !== "owner") {
    redirect("/no-access");
  }

  if (expectedShopId && context.shopId !== expectedShopId) {
    redirect("/no-access");
  }

  return context;
}
