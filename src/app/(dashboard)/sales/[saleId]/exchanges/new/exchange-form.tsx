"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { createSaleExchangeAction, type SaleExchangeActionState } from "../../exchange-actions";

type ReturnableItem = {
  id: string;
  variantId: string;
  description: string;
  quantity: number;
  remainingQuantity: number;
  lineTotal: string;
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
};
type CatalogItem = { variantId: string; productName: string; variantName: string; sku: string; barcode: string | null; sellingPrice: string; trackByImei: boolean; stockQuantity: number };
type DeviceOption = { id: string; variantId: string; imei1: string; imei2: string | null; serialNumber: string | null };
type PaymentAccount = { id: string; name: string; kind: string };
type CustomerOption = { id: string; name: string; phone: string | null };
type ReturnSelection = { quantity: number; condition: "RESTOCK" | "DAMAGED" | "OTHER" };
type CartLine = { variantId: string; quantity: number; imeiDeviceId: string | null };
type PaymentSplit = { key: string; financialAccountId: string; amount: string };

const initialState: SaleExchangeActionState = { status: "idle", message: "" };
const formatPKR = (value: string | number) => `Rs ${new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
const cartKey = (line: CartLine) => `${line.variantId}:${line.imeiDeviceId ?? "quantity"}`;
function centsText(value: number) { return (value / 100).toFixed(2); }
function returnedValueCents(item: ReturnableItem, quantity: number) {
  const total = Math.round(Number(item.lineTotal) * 100);
  const base = Math.floor(total / item.quantity);
  const extra = total % item.quantity;
  const alreadyReturned = item.quantity - item.remainingQuantity;
  let cents = 0;
  for (let index = alreadyReturned; index < alreadyReturned + quantity; index += 1) cents += base + (index < extra ? 1 : 0);
  return cents;
}

export default function SaleExchangeForm({ originalSaleId, documentNo, customerId: originalCustomerId, items, catalog, devices, paymentAccounts, customers }: {
  originalSaleId: string;
  documentNo: string;
  customerId: string | null;
  items: ReturnableItem[];
  catalog: CatalogItem[];
  devices: DeviceOption[];
  paymentAccounts: PaymentAccount[];
  customers: CustomerOption[];
}) {
  const [state, formAction, pending] = useActionState(createSaleExchangeAction, initialState);
  const [returnSelection, setReturnSelection] = useState<Record<string, ReturnSelection>>(() => Object.fromEntries(items.map((item) => [item.id, { quantity: 0, condition: "RESTOCK" as const }])));
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Record<string, string>>({});
  const [discountAmount, setDiscountAmount] = useState("0.00");
  const [selectedCustomerId, setSelectedCustomerId] = useState(originalCustomerId ?? "");
  const [allowCreditBalance, setAllowCreditBalance] = useState(false);
  const defaultPaymentAccountId = paymentAccounts[0]?.id ?? "";
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>(() => defaultPaymentAccountId ? [{ key: "1", financialAccountId: defaultPaymentAccountId, amount: "0.00" }] : []);
  const [nextPaymentKey, setNextPaymentKey] = useState(2);

  const selectedReturns = items.filter((item) => (returnSelection[item.id]?.quantity ?? 0) > 0).map((item) => ({ saleItemId: item.id, quantity: returnSelection[item.id].quantity, condition: returnSelection[item.id].condition }));
  const returnItemsJson = JSON.stringify(selectedReturns);
  const exchangeCreditCents = items.reduce((sum, item) => sum + returnedValueCents(item, returnSelection[item.id]?.quantity ?? 0), 0);
  const restockQtyByVariant = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of items) {
      const selected = returnSelection[item.id];
      if (!selected || selected.quantity <= 0 || selected.condition !== "RESTOCK") continue;
      result.set(item.variantId, (result.get(item.variantId) ?? 0) + selected.quantity);
    }
    return result;
  }, [items, returnSelection]);

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return catalog;
    return catalog.filter((item) => [item.productName, item.variantName, item.sku, item.barcode ?? ""].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [catalog, search]);
  const quantityInCart = useMemo(() => {
    const result = new Map<string, number>();
    for (const line of cart) result.set(line.variantId, (result.get(line.variantId) ?? 0) + line.quantity);
    return result;
  }, [cart]);
  const devicesByVariant = useMemo(() => {
    const result = new Map<string, DeviceOption[]>();
    for (const device of devices) result.set(device.variantId, [...(result.get(device.variantId) ?? []), device]);
    return result;
  }, [devices]);

  const subtotalCents = cart.reduce((sum, line) => {
    const item = catalog.find((candidate) => candidate.variantId === line.variantId);
    return sum + (item ? Math.round(Number(item.sellingPrice) * 100) * line.quantity : 0);
  }, 0);
  const parsedDiscount = Number(discountAmount);
  const discountCents = Number.isFinite(parsedDiscount) && parsedDiscount >= 0 ? Math.round(parsedDiscount * 100) : 0;
  const saleTotalCents = Math.max(0, subtotalCents - discountCents);
  const dueAfterCreditCents = Math.max(0, saleTotalCents - exchangeCreditCents);

  useEffect(() => {
    if (dueAfterCreditCents === 0) {
      setPaymentSplits((current) => current.length ? [] : current);
      return;
    }
    if (paymentSplits.length === 0 && !allowCreditBalance && defaultPaymentAccountId) {
      setPaymentSplits([{ key: "1", financialAccountId: defaultPaymentAccountId, amount: centsText(dueAfterCreditCents) }]);
      return;
    }
    if (paymentSplits.length !== 1) return;
    const nextAmount = centsText(dueAfterCreditCents);
    setPaymentSplits((current) => current.length === 1 && current[0].amount !== nextAmount ? [{ ...current[0], amount: nextAmount }] : current);
  }, [dueAfterCreditCents, paymentSplits.length, allowCreditBalance, defaultPaymentAccountId]);

  const amountCents = (value: string) => /^\d{1,12}(?:\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value) * 100) : Number.NaN;
  const paymentTotalCents = paymentSplits.reduce((sum, payment) => {
    const parsed = amountCents(payment.amount);
    return Number.isSafeInteger(parsed) && parsed > 0 ? sum + parsed : sum;
  }, 0);
  const paymentsValid = paymentSplits.length <= 10
    && paymentSplits.every((payment) => payment.financialAccountId && Number.isSafeInteger(amountCents(payment.amount)) && amountCents(payment.amount) > 0)
    && new Set(paymentSplits.map((payment) => payment.financialAccountId)).size === paymentSplits.length;
  const balanceAfterPayments = Math.max(0, dueAfterCreditCents - paymentTotalCents);
  const paymentRuleValid = dueAfterCreditCents === 0
    ? paymentSplits.length === 0 && paymentTotalCents === 0
    : allowCreditBalance
      ? paymentTotalCents <= dueAfterCreditCents && (balanceAfterPayments === 0 || selectedCustomerId.length > 0)
      : paymentSplits.length >= 1 && paymentTotalCents === dueAfterCreditCents;
  const canSubmit = selectedReturns.length > 0 && cart.length > 0 && exchangeCreditCents > 0 && saleTotalCents >= exchangeCreditCents && paymentsValid && paymentRuleValid && saleTotalCents > 0;
  const cartJson = JSON.stringify(cart);
  const paymentAllocationsJson = JSON.stringify(paymentSplits.map(({ financialAccountId, amount }) => ({ financialAccountId, amount })));

  function setReturnQuantity(item: ReturnableItem, quantity: number) {
    setReturnSelection((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? { quantity: 0, condition: "RESTOCK" as const }), quantity } }));
  }
  function addCatalogItem(item: CatalogItem) {
    const q = quantityInCart.get(item.variantId) ?? 0;
    const available = item.stockQuantity + (restockQtyByVariant.get(item.variantId) ?? 0);
    if (q >= available) return;
    if (item.trackByImei) {
      const deviceId = selectedDevices[item.variantId];
      if (!deviceId || cart.some((line) => line.imeiDeviceId === deviceId)) return;
      setCart((current) => [...current, { variantId: item.variantId, quantity: 1, imeiDeviceId: deviceId }]);
      return;
    }
    const key = `${item.variantId}:quantity`;
    setCart((current) => {
      const found = current.find((line) => cartKey(line) === key);
      return found ? current.map((line) => cartKey(line) === key ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { variantId: item.variantId, quantity: 1, imeiDeviceId: null }];
    });
  }
  function changeQuantity(key: string, delta: number) {
    setCart((current) => current.flatMap((line) => {
      if (cartKey(line) !== key) return [line];
      const next = line.quantity + delta;
      if (next < 1) return [];
      const item = catalog.find((candidate) => candidate.variantId === line.variantId);
      if (next > (item?.stockQuantity ?? 0) + (restockQtyByVariant.get(line.variantId) ?? 0)) return [line];
      return [{ ...line, quantity: next }];
    }));
  }
  function addPaymentSplit() {
    if (paymentSplits.length >= 10) return;
    const used = new Set(paymentSplits.map((item) => item.financialAccountId));
    const next = paymentAccounts.find((account) => !used.has(account.id));
    if (!next) return;
    setPaymentSplits((current) => [...current, { key: String(nextPaymentKey), financialAccountId: next.id, amount: "" }]);
    setNextPaymentKey((current) => current + 1);
  }

  if (state.status === "success") return <section className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><h2 className="font-semibold">Exchange completed</h2><p className="text-sm">{state.message}</p><div className="flex flex-wrap gap-2"><Link href={state.replacementSaleId ? `/sales/${state.replacementSaleId}` : "/sales"} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium">View replacement receipt</Link><Link href={`/sales/${originalSaleId}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium">View original receipt</Link></div></section>;

  return <form action={formAction} onSubmit={(event) => {
    if (!canSubmit) { event.preventDefault(); return; }
    if (!window.confirm(`Complete the exchange against ${documentNo}? Returned value ${formatPKR(centsText(exchangeCreditCents))}; replacement sale ${formatPKR(centsText(saleTotalCents))}; additional payment ${formatPKR(centsText(paymentTotalCents))}${balanceAfterPayments > 0 ? `; customer balance ${formatPKR(centsText(balanceAfterPayments))}` : ""}. This changes inventory and creates new ledger entries.`)) event.preventDefault();
  }} className="space-y-6">
    <input type="hidden" name="originalSaleId" value={originalSaleId} />
    <input type="hidden" name="returnItemsJson" value={returnItemsJson} />
    <input type="hidden" name="cartJson" value={cartJson} />
    <input type="hidden" name="discountAmount" value={discountAmount} />
    <input type="hidden" name="paymentAllocationsJson" value={paymentAllocationsJson} />
    <input type="hidden" name="customerId" value={selectedCustomerId} />
    <input type="hidden" name="allowCreditBalance" value={allowCreditBalance ? "true" : "false"} />

    <section className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
      <div><h2 className="text-lg font-semibold">1. Choose items being returned</h2><p className="mt-1 text-sm text-muted-foreground">Return value is calculated from the original receipt. Only RESTOCK items increase sellable inventory. An exchange requires a replacement sale at least as large as the return value; use a normal return/refund for lower-priced replacements.</p></div>
      {items.map((item) => {
        const current = returnSelection[item.id] ?? { quantity: 0, condition: "RESTOCK" as const };
        return <div key={item.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="font-medium">{item.description}</p>{item.imei1 ? <p className="mt-1 text-xs text-muted-foreground">IMEI: {item.imei1}{item.imei2 ? ` / ${item.imei2}` : ""}{item.serialNumber ? ` · Serial ${item.serialNumber}` : ""}</p> : null}<p className="mt-1 text-xs text-muted-foreground">Sold {item.quantity} · remaining returnable {item.remainingQuantity}</p><p className="mt-1 text-sm font-medium">Selected return value: {formatPKR(centsText(returnedValueCents(item, current.quantity)))}</p></div><label className="w-28 space-y-1 text-sm"><span className="font-medium">Return qty</span><input type="number" min={0} max={item.remainingQuantity} step={1} value={current.quantity} disabled={pending} onChange={(event) => setReturnQuantity(item, Math.max(0, Math.min(item.remainingQuantity, Number.parseInt(event.target.value || "0", 10) || 0)))} className="h-10 w-full rounded-md border bg-background px-3 text-right tabular-nums" /></label></div><label className="mt-3 block space-y-1 text-sm"><span className="font-medium">Condition</span><select value={current.condition} disabled={pending || current.quantity === 0} onChange={(event) => setReturnSelection((previous) => ({ ...previous, [item.id]: { ...current, condition: event.target.value as ReturnSelection["condition"] } }))} className="h-10 w-full rounded-md border bg-background px-3"><option value="RESTOCK">Good — return to sellable stock</option><option value="DAMAGED">Damaged — do not restock</option><option value="OTHER">Other — do not restock</option></select></label></div>;
      })}
      <div className="flex justify-between border-t pt-3 font-semibold"><span>Exchange credit</span><span className="tabular-nums">{formatPKR(centsText(exchangeCreditCents))}</span></div>
      <label className="block space-y-1 text-sm"><span className="font-medium">Exchange reason (optional)</span><textarea name="reason" maxLength={500} rows={2} disabled={pending} className="w-full rounded-md border bg-background px-3 py-2" placeholder="Faulty item, wrong model, customer preference…" /></label>
    </section>

    <section className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
      <div><h2 className="text-lg font-semibold">2. Choose replacement items</h2><p className="mt-1 text-sm text-muted-foreground">The server checks actual stock, price, cost and IMEI state. RESTOCK items from this return may be used by the replacement sale in the same transaction.</p></div>
      <label className="block"><span className="sr-only">Search replacement products</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, barcode…" className="h-10 w-full rounded-md border bg-background px-3 text-sm" /></label>
      <div className="grid gap-3 sm:grid-cols-2">{filteredCatalog.map((item) => {
        const currentQty = quantityInCart.get(item.variantId) ?? 0;
        const available = item.stockQuantity + (restockQtyByVariant.get(item.variantId) ?? 0);
        const deviceOptions = devicesByVariant.get(item.variantId) ?? [];
        const selectedDevice = selectedDevices[item.variantId] ?? "";
        const disabled = currentQty >= available;
        return <article key={item.variantId} className="flex min-w-0 flex-col gap-3 rounded-lg border p-3"><div><p className="font-medium">{item.productName}</p><p className="text-sm text-muted-foreground">{item.variantName} · SKU {item.sku}</p></div><div className="flex items-center justify-between gap-2"><div><p className="font-semibold">{formatPKR(item.sellingPrice)}</p><p className="text-xs text-muted-foreground">Stock {item.stockQuantity}{restockQtyByVariant.get(item.variantId) ? ` + ${restockQtyByVariant.get(item.variantId)} RESTOCK` : ""}</p></div>{!item.trackByImei ? <button type="button" onClick={() => addCatalogItem(item)} disabled={disabled || pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Add item</button> : null}</div>{item.trackByImei ? <div className="space-y-2"><select value={selectedDevice} onChange={(event) => setSelectedDevices((current) => ({ ...current, [item.variantId]: event.target.value }))} disabled={disabled || pending || deviceOptions.length === 0} className="h-10 w-full rounded-md border bg-background px-2 text-sm"><option value="">{deviceOptions.length ? "Select in-stock IMEI" : "No in-stock device"}</option>{deviceOptions.map((device) => <option key={device.id} value={device.id}>{device.imei1}{device.imei2 ? ` / ${device.imei2}` : ""}{device.serialNumber ? ` · ${device.serialNumber}` : ""}</option>)}</select><button type="button" onClick={() => addCatalogItem(item)} disabled={disabled || pending || !selectedDevice || cart.some((line) => line.imeiDeviceId === selectedDevice)} className="w-full rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">Add selected device</button></div> : null}</article>;
      })}</div>
      <div className="space-y-2 border-t pt-4"><h3 className="font-semibold">Replacement cart</h3>{cart.length === 0 ? <p className="text-sm text-muted-foreground">No replacement items selected.</p> : cart.map((line) => { const item = catalog.find((candidate) => candidate.variantId === line.variantId); if (!item) return null; const key = cartKey(line); return <div key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><p className="font-medium">{item.productName} — {item.variantName}</p><p className="text-sm text-muted-foreground">{formatPKR(item.sellingPrice)} × {line.quantity}{line.imeiDeviceId ? ` · IMEI ${devices.find((device) => device.id === line.imeiDeviceId)?.imei1 ?? "selected"}` : ""}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => changeQuantity(key, -1)} disabled={pending || Boolean(line.imeiDeviceId)} className="h-8 w-8 rounded-md border disabled:opacity-50">−</button><span className="w-6 text-center tabular-nums">{line.quantity}</span><button type="button" onClick={() => changeQuantity(key, 1)} disabled={pending || Boolean(line.imeiDeviceId) || line.quantity >= item.stockQuantity + (restockQtyByVariant.get(line.variantId) ?? 0)} className="h-8 w-8 rounded-md border disabled:opacity-50">+</button><button type="button" onClick={() => setCart((current) => current.filter((candidate) => cartKey(candidate) !== key))} disabled={pending} className="ml-1 text-sm text-destructive underline">Remove</button></div></div>; })}</div>
      <label className="block max-w-xs space-y-1 text-sm"><span className="font-medium">Replacement sale discount (PKR)</span><input type="number" min={0} max={subtotalCents / 100} step="0.01" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 text-right tabular-nums" /></label>
    </section>

    <section className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
      <div><h2 className="text-lg font-semibold">3. Settle the difference</h2><p className="mt-1 text-sm text-muted-foreground">Exchange credit is not cash received. The return and replacement sale are linked by their saved documents and use a dedicated exchange-clearing ledger account.</p></div>
      <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm"><div className="flex justify-between"><span>Replacement subtotal</span><span>{formatPKR(centsText(subtotalCents))}</span></div><div className="flex justify-between"><span>Discount</span><span>− {formatPKR(centsText(discountCents))}</span></div><div className="flex justify-between font-semibold"><span>Replacement sale total</span><span>{formatPKR(centsText(saleTotalCents))}</span></div><div className="flex justify-between"><span>Exchange credit</span><span>− {formatPKR(centsText(exchangeCreditCents))}</span></div><div className="flex justify-between border-t pt-2 font-semibold"><span>Difference due</span><span>{formatPKR(centsText(dueAfterCreditCents))}</span></div></div>
      <label className="block space-y-1 text-sm"><span className="font-medium">Customer</span><select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} disabled={pending || Boolean(originalCustomerId)} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Walk-in / no customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}</select>{originalCustomerId ? <span className="text-xs text-muted-foreground">This exchange stays with the customer recorded on the original sale.</span> : null}</label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={allowCreditBalance} onChange={(event) => setAllowCreditBalance(event.target.checked)} disabled={pending} className="mt-1" /><span><span className="font-medium">Allow a remaining customer balance</span><span className="block text-xs text-muted-foreground">The customer must be selected if the replacement difference is not fully paid.</span></span></label>
      <div className="space-y-3"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Additional payments</h3><button type="button" onClick={addPaymentSplit} disabled={pending || paymentSplits.length >= 10 || paymentSplits.length >= paymentAccounts.length} className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">Add payment account</button></div>{paymentSplits.length === 0 ? <p className="text-sm text-muted-foreground">No cash/wallet payment. The difference will remain as customer credit if permitted.</p> : paymentSplits.map((payment) => <div key={payment.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_150px_auto]"><label className="space-y-1 text-sm"><span className="font-medium">Receiving account</span><select value={payment.financialAccountId} disabled={pending} onChange={(event) => setPaymentSplits((current) => current.map((row) => row.key === payment.key ? { ...row, financialAccountId: event.target.value } : row))} className="h-10 w-full rounded-md border bg-background px-2">{paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.kind.replaceAll("_", " ")}</option>)}</select></label><label className="space-y-1 text-sm"><span className="font-medium">Amount (PKR)</span><input value={payment.amount} onChange={(event) => setPaymentSplits((current) => current.map((row) => row.key === payment.key ? { ...row, amount: event.target.value } : row))} disabled={pending} inputMode="decimal" className="h-10 w-full rounded-md border bg-background px-3 text-right tabular-nums" /></label><button type="button" onClick={() => setPaymentSplits((current) => current.filter((row) => row.key !== payment.key))} disabled={pending || (!allowCreditBalance && paymentSplits.length <= 1)} className="self-end rounded-md border px-3 py-2 text-sm disabled:opacity-50">Remove</button></div>)}</div>
      <div className="flex flex-wrap justify-between gap-3 border-t pt-3 text-sm"><span>Actual extra payment</span><span className="font-semibold tabular-nums">{formatPKR(centsText(paymentTotalCents))}</span></div><div className="flex flex-wrap justify-between gap-3 text-sm"><span>Remaining balance</span><span className={`font-semibold tabular-nums ${balanceAfterPayments ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{formatPKR(centsText(balanceAfterPayments))}</span></div>
    </section>

    {state.status === "error" ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{state.message}</div> : null}
    <button type="submit" disabled={pending || !canSubmit} className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Completing exchange…" : "Complete exchange"}</button>
    {!canSubmit ? <p className="text-xs text-muted-foreground">Select return item(s), replacement item(s), ensure the replacement total covers the exchange credit, and allocate the difference to payment or an allowed customer balance.</p> : null}
  </form>;
}
