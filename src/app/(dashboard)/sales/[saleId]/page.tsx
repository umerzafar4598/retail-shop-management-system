import Decimal from "decimal.js";
import Link from "next/link";
import { notFound } from "next/navigation";

import { hasPermission, requirePermission } from "@/lib/authorization";
import { requireSession } from "@/lib/session";
import { getSaleDetailsForShop } from "@/lib/pos/checkout";
import { getSaleReturnHistoryForShop } from "@/lib/pos/returns";
import PrintReceiptButton from "./print-receipt-button";
import CustomerPaymentForm from "./customer-payment-form";

const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPKR = (value: string | number) => `Rs ${moneyFormatter.format(Number(value))}`;

export default async function SaleReceiptPage({ params }: { params: Promise<{ saleId: string }> }) {
  const shop = await requirePermission("products.view");
  const session = await requireSession();
  const canRecordPayments = await hasPermission(session.user.id, shop.shopId, "products.update");
  const { saleId } = await params;
  const [details, returnHistory] = await Promise.all([
    getSaleDetailsForShop(shop.shopId, saleId),
    getSaleReturnHistoryForShop(shop.shopId, saleId),
  ]);
  if (!details || !returnHistory) notFound();
  const { sale, items, payments, paymentAccounts } = details;
  const totalReceived = payments.reduce((total, payment) => total.plus(payment.amount), new Decimal(0));
  const totalReturned = new Decimal(returnHistory.totalReturnedAmount);
  const exchangeCreditApplied = new Decimal(sale.exchangeCreditApplied);
  const outstandingAmount = Decimal.max(new Decimal(sale.totalAmount).minus(totalReceived).minus(totalReturned).minus(exchangeCreditApplied), 0).toFixed(2);
  const returnedQtyByItem = returnHistory.returnedQuantityBySaleItem;
  const hasReturnableItems = items.some((item) => item.quantity > (returnedQtyByItem[item.id] ?? 0));
  const hasPriorExchange = returnHistory.returns.some((record) => Boolean(record.replacementSaleId));

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4 md:p-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/sales" className="text-sm text-muted-foreground hover:text-foreground">← Back to Sales</Link>
        <div className="flex flex-wrap gap-2"><PrintReceiptButton />{sale.status === "COMPLETED" && hasReturnableItems && canRecordPayments && exchangeCreditApplied.isZero() && !hasPriorExchange ? <Link href={`/sales/${sale.id}/returns/new`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium">Record return</Link> : null}{sale.status === "COMPLETED" && hasReturnableItems && canRecordPayments ? <Link href={`/sales/${sale.id}/exchanges/new`} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Record exchange</Link> : null}</div>
      </div>

      <section className="rounded-xl border bg-card p-5 md:p-7 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Sales receipt</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{sale.documentNo}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{(sale.completedAt ?? sale.createdAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}</p>
            <p className="mt-1 text-sm text-muted-foreground">Customer: {sale.customerId && sale.customerName ? <Link href={`/customers/${sale.customerId}`} className="underline-offset-4 hover:underline">{sale.customerName}</Link> : "Walk-in customer"}{sale.customerPhone ? ` · ${sale.customerPhone}` : ""}</p>
          </div>
          <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${sale.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{sale.status}</span>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-3 pr-3 font-medium">Item</th><th className="px-3 py-3 text-right font-medium">Qty</th><th className="px-3 py-3 text-right font-medium">Unit price</th><th className="px-3 py-3 text-right font-medium">Discount</th><th className="py-3 pl-3 text-right font-medium">Line total</th></tr></thead>
            <tbody className="divide-y">{items.map((item) => <tr key={item.id}><td className="py-3 pr-3"><p className="font-medium">{item.description}</p>{item.imei1 ? <p className="mt-1 text-xs text-muted-foreground">IMEI 1: {item.imei1}{item.imei2 ? ` · IMEI 2: ${item.imei2}` : ""}{item.serialNumber ? ` · Serial: ${item.serialNumber}` : ""}</p> : null}</td><td className="px-3 py-3 text-right tabular-nums">{item.quantity}</td><td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPKR(item.unitPrice)}</td><td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPKR(item.discountAmount)}</td><td className="whitespace-nowrap py-3 pl-3 text-right font-medium tabular-nums">{formatPKR(item.lineTotal)}</td></tr>)}</tbody>
          </table>
        </div>

        <div className="ml-auto mt-5 w-full max-w-sm space-y-2 border-t pt-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatPKR(sale.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">− {formatPKR(sale.discountAmount)}</span></div>
          <div className="flex justify-between border-t pt-3 text-base font-semibold"><span>Original sale total</span><span className="tabular-nums">{formatPKR(sale.totalAmount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Received to date</span><span className="tabular-nums">{formatPKR(totalReceived.toFixed(2))}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Returned value</span><span className="tabular-nums">− {formatPKR(totalReturned.toFixed(2))}</span></div>
          {exchangeCreditApplied.greaterThan(0) ? <div className="flex justify-between"><span className="text-muted-foreground">Exchange credit applied</span><span className="tabular-nums">− {formatPKR(exchangeCreditApplied.toFixed(2))}</span></div> : null}
          <div className="flex justify-between"><span className="text-muted-foreground">Outstanding balance</span><span className={`font-semibold tabular-nums ${Number(outstandingAmount) > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{formatPKR(outstandingAmount)}</span></div>
          {Number(returnHistory.totalCashRefunded) > 0 ? <div className="flex justify-between"><span className="text-muted-foreground">Cash refunded to date</span><span className="tabular-nums">{formatPKR(returnHistory.totalCashRefunded)}</span></div> : null}
        </div>

        <section className="mt-6 border-t pt-5">
          <h2 className="font-semibold">Payment history</h2>
          {payments.length > 0 ? <div className="mt-3 divide-y rounded-lg border">{payments.map((payment, index) => <div key={`${payment.accountName}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"><div><p className="font-medium">{payment.accountName}</p><p className="mt-0.5 text-xs text-muted-foreground">{payment.paidAt.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}</p></div><p className="font-semibold tabular-nums">{formatPKR(payment.amount)}</p></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No payment has been recorded for this sale yet.</p>}
        </section>

        <section className="mt-6 border-t pt-5">
          <h2 className="font-semibold">Return history</h2>
          {returnHistory.returns.length > 0 ? <div className="mt-3 divide-y rounded-lg border">{returnHistory.returns.map((record) => <div key={record.id} className="space-y-1 px-3 py-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{record.documentNo}</p><span className="text-xs text-muted-foreground">{record.createdAt.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}</span></div><p className="text-muted-foreground">Returned value: {formatPKR(record.returnedValue)} · Cash refund: {formatPKR(record.cashRefunded)}</p>{record.reason ? <p className="text-muted-foreground">Reason: {record.reason}</p> : null}{record.replacementSaleId ? <p className="text-muted-foreground">Replacement sale: <Link className="underline-offset-4 hover:underline" href={`/sales/${record.replacementSaleId}`}>Open replacement receipt</Link></p> : null}<ul className="list-inside list-disc text-xs text-muted-foreground">{record.items.map((item, index) => <li key={`${record.id}-${item.description}-${index}`}>{item.description}{item.imei1 ? ` · IMEI ${item.imei1}` : ""} — qty {item.quantity}, {item.condition.replaceAll("_", " ")}, value {formatPKR(item.amount)}</li>)}</ul>{record.refunds.map((refund, index) => <p key={`${record.id}-${index}`} className="text-xs text-muted-foreground">Refund: {formatPKR(refund.amount)} from {refund.accountName} on {refund.refundedAt.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}</p>)}</div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No returns recorded for this sale.</p>}
        </section>

        {Number(outstandingAmount) > 0 && sale.customerId && canRecordPayments ? <section className="mt-6 border-t pt-5 print:hidden"><CustomerPaymentForm saleId={sale.id} documentNo={sale.documentNo} outstandingAmount={outstandingAmount} paymentAccounts={paymentAccounts} /></section> : null}
        {exchangeCreditApplied.greaterThan(0) || hasPriorExchange ? <p className="mt-5 rounded-md border p-3 text-sm text-muted-foreground">This sale participates in an exchange. Use <strong>Record exchange</strong> for further changes. Direct cash-return processing is blocked in this MVP to avoid treating exchange credit as cash or refunding it twice.</p> : null}
        {Number(outstandingAmount) > 0 && !sale.customerId ? <p className="mt-5 rounded-md border p-3 text-sm text-amber-800 dark:text-amber-200">This sale has an outstanding amount but no customer attached. Investigate the historical record before collecting payment.</p> : null}
        <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">Original sale records are preserved. Returns are recorded as separate documents with compensating inventory and ledger entries.</p>
      </section>
    </main>
  );
}
