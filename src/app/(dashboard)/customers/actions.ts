"use server";

import { logUnexpectedActionError } from "@/lib/errors/safe-action-errors";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { createCustomerForShop, CustomerRecordError } from "@/lib/pos/customers";

export type CustomerActionState = {
  status: "idle" | "success" | "error";
  message: string;
  customerId?: string;
};

export async function createCustomerAction(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const shop = await requirePermission("customers.create");
  const session = await requireSession();
  const getString = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };

  try {
    const customer = await createCustomerForShop({
      shopId: shop.shopId,
      createdBy: session.user.id,
      name: getString("name"),
      phone: getString("phone"),
      notes: getString("notes"),
    });
    revalidatePath("/customers");
    revalidatePath("/pos");
    return { status: "success", message: `${customer.name} was added successfully.`, customerId: customer.id };
  } catch (error) {
    if (error instanceof CustomerRecordError) return { status: "error", message: error.message };
    logUnexpectedActionError("src/app/(dashboard)/customers/actions.ts", error);
    return { status: "error", message: "The customer could not be saved. Check the server log if the problem continues." };
  }
}
