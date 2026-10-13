import "server-only";

import Decimal from "decimal.js";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { requireOwnerFinancialReportAccess } from "@/lib/authorization/owner-financial-reports";

export type ReportDateRange = {
  startDate: string;
  endDate: string;
};

function money(value: string | number | null | undefined): Decimal {
  return new Decimal(value ?? "0");
}

function pakistanToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getDefaultReportDateRange(): ReportDateRange {
  const endDate = pakistanToday();
  return { startDate: `${endDate.slice(0, 7)}-01`, endDate };
}

export function normalizeReportDateRange(
  requestedStart: string | undefined,
  requestedEnd: string | undefined,
): { range: ReportDateRange; warning: string | null } {
  const fallback = getDefaultReportDateRange();
  if (!validDate(requestedStart) || !validDate(requestedEnd)) {
    return { range: fallback, warning: requestedStart || requestedEnd ? "The requested dates were invalid; showing the current month instead." : null };
  }
  if (requestedStart > requestedEnd) {
    return { range: fallback, warning: "Start date must be on or before end date; showing the current month instead." };
  }
  const span = (Date.parse(`${requestedEnd}T00:00:00Z`) - Date.parse(`${requestedStart}T00:00:00Z`)) / 86_400_000;
  if (span > 365) {
    return { range: fallback, warning: "Please choose a range of 366 days or less; showing the current month instead." };
  }
  return { range: { startDate: requestedStart, endDate: requestedEnd }, warning: null };
}

export async function getManagementReportForShop(shopId: string, range: ReportDateRange) {
  await requireOwnerFinancialReportAccess(shopId);
  const periodStart = sql`(CAST(${range.startDate} AS date)::timestamp AT TIME ZONE 'Asia/Karachi')`;
  const periodEnd = sql`((CAST(${range.endDate} AS date) + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Karachi')`;

  const [activityResult, countsResult, accountResult, positionResult, inventoryResult, dailyResult, expenseResult, discrepancyResult] = await Promise.all([
    db.execute<{
      product_sales: string;
      sales_returns: string;
      service_revenue: string;
      cogs: string;
      operating_expenses: string;
    }>(sql`
      SELECT
        COALESCE(SUM(CASE WHEN la.code = '4000' THEN le.credit::numeric - le.debit::numeric ELSE 0 END), 0)::text AS product_sales,
        COALESCE(SUM(CASE WHEN la.code = '4900' THEN le.debit::numeric - le.credit::numeric ELSE 0 END), 0)::text AS sales_returns,
        COALESCE(SUM(CASE WHEN la.code = '4100' THEN le.credit::numeric - le.debit::numeric ELSE 0 END), 0)::text AS service_revenue,
        COALESCE(SUM(CASE WHEN la.code = '5000' THEN le.debit::numeric - le.credit::numeric ELSE 0 END), 0)::text AS cogs,
        COALESCE(SUM(CASE WHEN la.account_type = 'EXPENSE' AND la.code <> '5000' THEN le.debit::numeric - le.credit::numeric ELSE 0 END), 0)::text AS operating_expenses
      FROM ledger_entries le
      INNER JOIN ledger_transactions lt
        ON lt.shop_id = le.shop_id AND lt.id = le.ledger_transaction_id
      INNER JOIN ledger_accounts la
        ON la.shop_id = le.shop_id AND la.id = le.ledger_account_id
      WHERE le.shop_id = ${shopId}
        AND lt.occurred_at >= ${periodStart}
        AND lt.occurred_at < ${periodEnd}
    `),
    db.execute<{
      sales_count: number;
      completed_services_count: number;
      returns_count: number;
      posted_expenses_count: number;
      completed_purchases_count: number;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM sales s WHERE s.shop_id = ${shopId} AND s.status = 'COMPLETED'
          AND COALESCE(s.completed_at, s.created_at) >= ${periodStart} AND COALESCE(s.completed_at, s.created_at) < ${periodEnd}) AS sales_count,
        (SELECT COUNT(*)::int FROM service_transactions st WHERE st.shop_id = ${shopId} AND st.service_status = 'COMPLETED'
          AND COALESCE(st.completed_at, st.created_at) >= ${periodStart} AND COALESCE(st.completed_at, st.created_at) < ${periodEnd}) AS completed_services_count,
        (SELECT COUNT(*)::int FROM sale_returns sr WHERE sr.shop_id = ${shopId} AND sr.status = 'COMPLETED'
          AND COALESCE(sr.completed_at, sr.created_at) >= ${periodStart} AND COALESCE(sr.completed_at, sr.created_at) < ${periodEnd}) AS returns_count,
        (SELECT COUNT(*)::int FROM expenses e WHERE e.shop_id = ${shopId} AND e.status = 'POSTED'
          AND e.expense_date >= CAST(${range.startDate} AS date) AND e.expense_date <= CAST(${range.endDate} AS date)) AS posted_expenses_count,
        (SELECT COUNT(*)::int FROM purchases p WHERE p.shop_id = ${shopId} AND p.status = 'POSTED'
          AND COALESCE(p.posted_at, p.created_at) >= ${periodStart} AND COALESCE(p.posted_at, p.created_at) < ${periodEnd}) AS completed_purchases_count
    `),
    db.execute<{
      id: string;
      name: string;
      kind: string;
      provider: string;
      ledger_code: string;
      balance: string;
    }>(sql`
      SELECT fa.id::text AS id, fa.name, fa.kind::text AS kind, fa.provider, la.code AS ledger_code,
        COALESCE(SUM(le.debit::numeric - le.credit::numeric), 0)::text AS balance
      FROM financial_accounts fa
      INNER JOIN ledger_accounts la ON la.shop_id = fa.shop_id AND la.id = fa.ledger_account_id
      LEFT JOIN ledger_entries le ON le.shop_id = la.shop_id AND le.ledger_account_id = la.id
      WHERE fa.shop_id = ${shopId} AND fa.is_active = true
      GROUP BY fa.id, fa.name, fa.kind, fa.provider, la.code
      ORDER BY fa.kind::text, fa.name
    `),
    db.execute<{ code: string; name: string; normal_balance: string; raw_balance: string }>(sql`
      SELECT la.code, la.name, la.normal_balance::text AS normal_balance,
        COALESCE(SUM(le.debit::numeric - le.credit::numeric), 0)::text AS raw_balance
      FROM ledger_accounts la
      LEFT JOIN ledger_entries le ON le.shop_id = la.shop_id AND le.ledger_account_id = la.id
      WHERE la.shop_id = ${shopId} AND la.code IN ('1300', '2000')
      GROUP BY la.code, la.name, la.normal_balance
    `),
    db.execute<{
      variant_count: number;
      total_units: number;
      inventory_value: string;
      low_stock_count: number;
      out_of_stock_count: number;
    }>(sql`
      SELECT
        COUNT(*)::int AS variant_count,
        COALESCE(SUM(ib.quantity), 0)::int AS total_units,
        COALESCE(SUM(CASE WHEN pv.track_by_imei THEN COALESCE(dev.device_value, 0)
                          ELSE ib.quantity::numeric * ib.average_cost::numeric END), 0)::text AS inventory_value,
        COUNT(*) FILTER (WHERE ib.quantity > 0 AND ib.quantity <= pv.reorder_level)::int AS low_stock_count,
        COUNT(*) FILTER (WHERE ib.quantity <= 0)::int AS out_of_stock_count
      FROM inventory_balances ib
      INNER JOIN product_variants pv ON pv.shop_id = ib.shop_id AND pv.id = ib.variant_id
      LEFT JOIN (
        SELECT shop_id, variant_id, SUM(purchase_cost::numeric) AS device_value
        FROM imei_devices WHERE status = 'IN_STOCK'
        GROUP BY shop_id, variant_id
      ) dev ON dev.shop_id = ib.shop_id AND dev.variant_id = ib.variant_id
      WHERE ib.shop_id = ${shopId}
    `),
    db.execute<{ report_date: string; product_sales: string; sales_returns: string; service_revenue: string }>(sql`
      WITH days AS (
        SELECT generate_series(CAST(${range.startDate} AS date), CAST(${range.endDate} AS date), INTERVAL '1 day')::date AS day
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS report_date,
        COALESCE(SUM(CASE WHEN la.code = '4000' THEN le.credit::numeric - le.debit::numeric ELSE 0 END), 0)::text AS product_sales,
        COALESCE(SUM(CASE WHEN la.code = '4900' THEN le.debit::numeric - le.credit::numeric ELSE 0 END), 0)::text AS sales_returns,
        COALESCE(SUM(CASE WHEN la.code = '4100' THEN le.credit::numeric - le.debit::numeric ELSE 0 END), 0)::text AS service_revenue
      FROM days
      LEFT JOIN ledger_transactions lt ON lt.shop_id = ${shopId}
        AND lt.occurred_at >= (days.day::timestamp AT TIME ZONE 'Asia/Karachi')
        AND lt.occurred_at < ((days.day + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Karachi')
      LEFT JOIN ledger_entries le ON le.shop_id = lt.shop_id AND le.ledger_transaction_id = lt.id
      LEFT JOIN ledger_accounts la ON la.shop_id = le.shop_id AND la.id = le.ledger_account_id
      GROUP BY days.day ORDER BY days.day
    `),
    db.execute<{ code: string; name: string; amount: string }>(sql`
      SELECT la.code, la.name,
        COALESCE(SUM(le.debit::numeric - le.credit::numeric), 0)::text AS amount
      FROM ledger_accounts la
      INNER JOIN ledger_entries le ON le.shop_id = la.shop_id AND le.ledger_account_id = la.id
      INNER JOIN ledger_transactions lt ON lt.shop_id = le.shop_id AND lt.id = le.ledger_transaction_id
      WHERE la.shop_id = ${shopId} AND la.account_type = 'EXPENSE' AND la.code <> '5000'
        AND lt.occurred_at >= ${periodStart} AND lt.occurred_at < ${periodEnd}
      GROUP BY la.code, la.name
      HAVING COALESCE(SUM(le.debit::numeric - le.credit::numeric), 0) <> 0
      ORDER BY ABS(SUM(le.debit::numeric - le.credit::numeric)) DESC, la.code
      LIMIT 10
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM cash_sessions
      WHERE shop_id = ${shopId} AND status = 'RECONCILIATION_REQUIRED'
    `),
  ]);

  const activity = activityResult.rows[0];
  const counts = countsResult.rows[0];
  const inventory = inventoryResult.rows[0];
  const valuesByCode = new Map<string, { normalBalance: string; rawBalance: Decimal; name: string }>(positionResult.rows.map((row) => [row.code, {
    normalBalance: row.normal_balance,
    rawBalance: money(row.raw_balance),
    name: row.name,
  }] as const));
  const receivable = valuesByCode.get("1300");
  const payable = valuesByCode.get("2000");
  const accountsReceivable = receivable
    ? (receivable.normalBalance === "DEBIT" ? receivable.rawBalance : receivable.rawBalance.negated()).toFixed(2)
    : "0.00";
  const accountsPayable = payable
    ? (payable.normalBalance === "CREDIT" ? payable.rawBalance.negated() : payable.rawBalance).toFixed(2)
    : "0.00";

  const productSales = money(activity?.product_sales);
  const returns = money(activity?.sales_returns);
  const serviceRevenue = money(activity?.service_revenue);
  const cogs = money(activity?.cogs);
  const operatingExpenses = money(activity?.operating_expenses);
  const netProductSales = productSales.minus(returns);
  const grossProfit = netProductSales.minus(cogs);
  const estimatedOperatingProfit = grossProfit.plus(serviceRevenue).minus(operatingExpenses);

  return {
    range,
    metrics: {
      productSales: productSales.toFixed(2),
      salesReturns: returns.toFixed(2),
      netProductSales: netProductSales.toFixed(2),
      serviceRevenue: serviceRevenue.toFixed(2),
      cogs: cogs.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      operatingExpenses: operatingExpenses.toFixed(2),
      estimatedOperatingProfit: estimatedOperatingProfit.toFixed(2),
      accountsReceivable,
      accountsPayable,
      inventoryValue: money(inventory?.inventory_value).toFixed(2),
      salesCount: counts?.sales_count ?? 0,
      completedServicesCount: counts?.completed_services_count ?? 0,
      returnsCount: counts?.returns_count ?? 0,
      postedExpensesCount: counts?.posted_expenses_count ?? 0,
      postedPurchasesCount: counts?.completed_purchases_count ?? 0,
      inventoryVariantCount: inventory?.variant_count ?? 0,
      inventoryUnits: inventory?.total_units ?? 0,
      lowStockCount: inventory?.low_stock_count ?? 0,
      outOfStockCount: inventory?.out_of_stock_count ?? 0,
      cashDiscrepancyCount: discrepancyResult.rows[0]?.count ?? 0,
    },
    accountBalances: accountResult.rows.map((row) => ({
      ...row,
      balance: money(row.balance).toFixed(2),
    })),
    dailyActivity: dailyResult.rows.map((row) => ({
      date: row.report_date,
      productSales: money(row.product_sales).toFixed(2),
      salesReturns: money(row.sales_returns).toFixed(2),
      serviceRevenue: money(row.service_revenue).toFixed(2),
    })),
    expenseBreakdown: expenseResult.rows.map((row) => ({ ...row, amount: money(row.amount).toFixed(2) })),
  };
}

export async function getInventoryReportForShop(shopId: string) {
  await requireOwnerFinancialReportAccess(shopId);
  const result = await db.execute<{
    variant_id: string;
    product_name: string;
    variant_name: string;
    sku: string;
    quantity: number;
    reorder_level: number;
    track_by_imei: boolean;
    active: boolean;
    average_cost: string;
    inventory_value: string;
  }>(sql`
    SELECT pv.id::text AS variant_id, p.name AS product_name, pv.name AS variant_name,
      pv.sku, ib.quantity, pv.reorder_level, pv.track_by_imei,
      (p.active AND pv.active) AS active,
      ib.average_cost::text AS average_cost,
      (CASE WHEN pv.track_by_imei THEN COALESCE(dev.device_value, 0)
            ELSE ib.quantity::numeric * ib.average_cost::numeric END)::text AS inventory_value
    FROM inventory_balances ib
    INNER JOIN product_variants pv ON pv.shop_id = ib.shop_id AND pv.id = ib.variant_id
    INNER JOIN products p ON p.shop_id = pv.shop_id AND p.id = pv.product_id
    LEFT JOIN (
      SELECT shop_id, variant_id, SUM(purchase_cost::numeric) AS device_value
      FROM imei_devices WHERE status = 'IN_STOCK'
      GROUP BY shop_id, variant_id
    ) dev ON dev.shop_id = ib.shop_id AND dev.variant_id = ib.variant_id
    WHERE ib.shop_id = ${shopId}
    ORDER BY (p.active AND pv.active) DESC, p.name, pv.name
  `);
  return result.rows.map((row) => ({ ...row, inventoryValue: money(row.inventory_value).toFixed(2) }));
}
