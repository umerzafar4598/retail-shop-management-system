import "server-only";

import Decimal from "decimal.js";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs, customers, saleReturnItems, saleReturns, sales } from "@/db/schema";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CustomerRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerRecordError";
  }
}

export async function createCustomerForShop(input: {
  shopId: string;
  createdBy: string;
  name: string;
  phone: string;
  notes: string;
}) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const phone = input.phone.trim();
  const notes = input.notes.trim();

  if (name.length < 2 || name.length > 150) {
    throw new CustomerRecordError("Customer name must be between 2 and 150 characters.");
  }
  if (phone.length > 40) throw new CustomerRecordError("Phone number must be 40 characters or fewer.");
  if (notes.length > 1000) throw new CustomerRecordError("Notes must be 1,000 characters or fewer.");

  return db.transaction(async (tx) => {
    if (phone) {
      const existing = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.shopId, input.shopId), eq(customers.phone, phone)))
        .limit(1);
      if (existing.length > 0) throw new CustomerRecordError("A customer with this phone number already exists in this shop.");
    }

    const [customer] = await tx
      .insert(customers)
      .values({
        shopId: input.shopId,
        name,
        phone: phone || null,
        notes: notes || null,
        active: true,
      })
      .returning({ id: customers.id, name: customers.name, phone: customers.phone });

    await tx.insert(auditLogs).values({
      shopId: input.shopId,
      actorUserId: input.createdBy,
      action: "CUSTOMER_CREATED",
      entityType: "CUSTOMER",
      entityId: customer.id,
      metadata: { name: customer.name, phone: customer.phone },
    });

    return customer;
  });
}

export async function listCustomersForShop(shopId: string) {
  const [customerRows, balanceRows] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name, phone: customers.phone, notes: customers.notes, createdAt: customers.createdAt })
      .from(customers)
      .where(and(eq(customers.shopId, shopId), eq(customers.active, true)))
      .orderBy(asc(customers.name)),
    db
      .select({
        customerId: sales.customerId,
        outstanding: sql<string>`COALESCE(SUM(GREATEST(${sales.totalAmount}::numeric - COALESCE((SELECT SUM(sp.amount::numeric) FROM sale_payments sp WHERE sp.shop_id = "sales"."shop_id" AND sp.sale_id = "sales"."id"), 0) - COALESCE((SELECT SUM(sri.amount::numeric) FROM sale_return_items sri INNER JOIN sale_returns sr ON sr.shop_id = sri.shop_id AND sr.id = sri.return_id WHERE sri.shop_id = "sales"."shop_id" AND sr.original_sale_id = "sales"."id" AND sr.status = 'COMPLETED'), 0) - COALESCE((SELECT SUM(exri.amount::numeric) FROM sale_returns exr INNER JOIN sale_return_items exri ON exri.shop_id = exr.shop_id AND exri.return_id = exr.id WHERE exr.shop_id = "sales"."shop_id" AND exr.replacement_sale_id = "sales"."id" AND exr.status = 'COMPLETED'), 0), 0)), 0)::text`,
      })
      .from(sales)
      .where(and(eq(sales.shopId, shopId), eq(sales.status, "COMPLETED"), sql`${sales.customerId} IS NOT NULL`))
      .groupBy(sales.customerId),
  ]);

  const balances = new Map<string, string>();
  for (const row of balanceRows) {
    if (row.customerId) balances.set(row.customerId, new Decimal(row.outstanding).toFixed(2));
  }

  return customerRows.map((customer) => ({
    ...customer,
    outstandingBalance: balances.get(customer.id) ?? "0.00",
  }));
}

export async function getCustomerDetailsForShop(shopId: string, customerId: string) {
  if (!UUID_PATTERN.test(customerId)) return null;

  const [customer] = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, notes: customers.notes, createdAt: customers.createdAt })
    .from(customers)
    .where(and(eq(customers.shopId, shopId), eq(customers.id, customerId)))
    .limit(1);
  if (!customer) return null;

  const saleRows = await db
    .select({
      id: sales.id,
      documentNo: sales.documentNo,
      status: sales.status,
      subtotal: sales.subtotal,
      discountAmount: sales.discountAmount,
      totalAmount: sales.totalAmount,
      createdAt: sales.createdAt,
      totalReceived: sql<string>`COALESCE((SELECT SUM(sp.amount::numeric) FROM sale_payments sp WHERE sp.shop_id = "sales"."shop_id" AND sp.sale_id = "sales"."id"), 0)::text`,
      totalReturned: sql<string>`COALESCE((SELECT SUM(sri.amount::numeric) FROM sale_return_items sri INNER JOIN sale_returns sr ON sr.shop_id = sri.shop_id AND sr.id = sri.return_id WHERE sri.shop_id = "sales"."shop_id" AND sr.original_sale_id = "sales"."id" AND sr.status = 'COMPLETED'), 0)::text`,
      exchangeCreditApplied: sql<string>`COALESCE((SELECT SUM(exri.amount::numeric) FROM sale_returns exr INNER JOIN sale_return_items exri ON exri.shop_id = exr.shop_id AND exri.return_id = exr.id WHERE exr.shop_id = "sales"."shop_id" AND exr.replacement_sale_id = "sales"."id" AND exr.status = 'COMPLETED'), 0)::text`,
    })
    .from(sales)
    .where(and(eq(sales.shopId, shopId), eq(sales.customerId, customerId)))
    .orderBy(desc(sales.createdAt))
    .limit(100);

  const salesWithBalances = saleRows.map((sale) => {
    const outstanding = Decimal.max(new Decimal(sale.totalAmount).minus(sale.totalReceived).minus(sale.totalReturned).minus(sale.exchangeCreditApplied), 0);
    return {
      ...sale,
      totalReceived: new Decimal(sale.totalReceived).toFixed(2),
      outstandingAmount: outstanding.toFixed(2),
    };
  });

  const [balanceRow] = await db
    .select({
      outstanding: sql<string>`COALESCE(SUM(GREATEST(${sales.totalAmount}::numeric - COALESCE((SELECT SUM(sp.amount::numeric) FROM sale_payments sp WHERE sp.shop_id = "sales"."shop_id" AND sp.sale_id = "sales"."id"), 0) - COALESCE((SELECT SUM(sri.amount::numeric) FROM sale_return_items sri INNER JOIN sale_returns sr ON sr.shop_id = sri.shop_id AND sr.id = sri.return_id WHERE sri.shop_id = "sales"."shop_id" AND sr.original_sale_id = "sales"."id" AND sr.status = 'COMPLETED'), 0) - COALESCE((SELECT SUM(exri.amount::numeric) FROM sale_returns exr INNER JOIN sale_return_items exri ON exri.shop_id = exr.shop_id AND exri.return_id = exr.id WHERE exr.shop_id = "sales"."shop_id" AND exr.replacement_sale_id = "sales"."id" AND exr.status = 'COMPLETED'), 0), 0)), 0)::text`,
    })
    .from(sales)
    .where(and(eq(sales.shopId, shopId), eq(sales.customerId, customerId), eq(sales.status, "COMPLETED")));
  const outstandingBalance = new Decimal(balanceRow?.outstanding ?? "0").toFixed(2);

  return { customer, sales: salesWithBalances, outstandingBalance };
}
