"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";

import { completePosSaleAction, type PosCheckoutActionState } from "./actions";

type CatalogItem = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  sellingPrice: string;
  trackByImei: boolean;
  stockQuantity: number;
};

type DeviceOption = {
  id: string;
  variantId: string;
  imei1: string;
  imei2: string | null;
  serialNumber: string | null;
};

type PaymentAccount = { id: string; name: string; kind: string };
type CustomerOption = { id: string; name: string; phone: string | null };
type CartLine = { variantId: string; quantity: number; imeiDeviceId: string | null };
type PaymentSplit = { key: string; financialAccountId: string; amount: string };

const initialState: PosCheckoutActionState = { status: "idle", message: "" };
const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPKR = (value: string | number) => `Rs ${moneyFormatter.format(Number(value))}`;
const cartKey = (line: CartLine) => `${line.variantId}:${line.imeiDeviceId ?? "quantity"}`;

export default function PosCheckoutForm({
  catalog,
  devices,
  paymentAccounts,
  customers,
  defaultRetailCashDrawerId,
}: {
  catalog: CatalogItem[];
  devices: DeviceOption[];
  paymentAccounts: PaymentAccount[];
  customers: CustomerOption[];
  defaultRetailCashDrawerId: string | null;
}) {
  const [state, formAction, pending] = useActionState(completePosSaleAction, initialState);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Record<string, string>>({});
  const defaultPaymentAccountId = (defaultRetailCashDrawerId && paymentAccounts.some((account) => account.id === defaultRetailCashDrawerId)
    ? defaultRetailCashDrawerId
    : paymentAccounts.find((account) => account.kind === "CASH")?.id ?? paymentAccounts[0]?.id) ?? "";
  const [discountAmount, setDiscountAmount] = useState("0.00");
  const [customerId, setCustomerId] = useState("");
  const [allowCreditBalance, setAllowCreditBalance] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>(() => defaultPaymentAccountId
    ? [{ key: "1", financialAccountId: defaultPaymentAccountId, amount: "0.00" }]
    : []);
  const [nextPaymentKey, setNextPaymentKey] = useState(2);

  useEffect(() => {
    if (state.status === "success" && state.saleId) {
      setCart([]);
      setDiscountAmount("0.00");
      setSearch("");
      setCustomerId("");
      setAllowCreditBalance(false);
      setPaymentSplits(defaultPaymentAccountId ? [{ key: "1", financialAccountId: defaultPaymentAccountId, amount: "0.00" }] : []);
      setNextPaymentKey(2);
    }
  }, [state.status, state.saleId, defaultPaymentAccountId]);

  const availableDevicesByVariant = useMemo(() => {
    const result = new Map<string, DeviceOption[]>();
    for (const device of devices) {
      const current = result.get(device.variantId) ?? [];
      current.push(device);
      result.set(device.variantId, current);
    }
    return result;
  }, [devices]);

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return catalog;
    return catalog.filter((item) =>
      [item.productName, item.variantName, item.sku, item.barcode ?? ""]
        .some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [catalog, search]);

  const stockRequestedByVariant = useMemo(() => {
    const result = new Map<string, number>();
    for (const line of cart) result.set(line.variantId, (result.get(line.variantId) ?? 0) + line.quantity);
    return result;
  }, [cart]);

  const subtotalCents = useMemo(() => cart.reduce((sum, line) => {
    const item = catalog.find((candidate) => candidate.variantId === line.variantId);
    if (!item) return sum;
    return sum + Math.round(Number(item.sellingPrice) * 100) * line.quantity;
  }, 0), [cart, catalog]);
  const subtotal = subtotalCents / 100;
  const parsedDiscount = Number(discountAmount);
  const discountPreview = Number.isFinite(parsedDiscount) && parsedDiscount >= 0 ? parsedDiscount : 0;
  const discountPreviewCents = Math.round(discountPreview * 100);
  const totalPreviewCents = Math.max(0, subtotalCents - discountPreviewCents);
  const totalPreview = totalPreviewCents / 100;
  const totalUnits = cart.reduce((sum, line) => sum + line.quantity, 0);

  // A single payment always defaults to the exact amount due. For split tenders,
  // keep the staff-entered amounts so they can allocate the total across accounts.
  useEffect(() => {
    if (paymentSplits.length !== 1) return;
    const amount = (totalPreviewCents / 100).toFixed(2);
    setPaymentSplits((current) => current.length === 1 && current[0].amount !== amount
      ? [{ ...current[0], amount }]
      : current);
  }, [totalPreviewCents, paymentSplits.length]);

  const paymentAmountCents = (amount: string) => {
    const normalized = amount.trim();
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
  };
  const paymentTotalCents = paymentSplits.reduce((sum, payment) => {
    const amount = paymentAmountCents(payment.amount);
    return Number.isSafeInteger(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
  const paymentAccountIds = paymentSplits.map((payment) => payment.financialAccountId);
  const paymentRowsValid = paymentSplits.length <= 10
    && paymentSplits.every((payment) => payment.financialAccountId.length > 0
      && Number.isSafeInteger(paymentAmountCents(payment.amount))
      && paymentAmountCents(payment.amount) > 0)
    && new Set(paymentAccountIds).size === paymentAccountIds.length;
  const outstandingPreviewCents = Math.max(0, totalPreviewCents - paymentTotalCents);
  const paymentAmountRuleValid = allowCreditBalance
    ? paymentTotalCents <= totalPreviewCents && (outstandingPreviewCents === 0 || customerId.length > 0)
    : paymentSplits.length >= 1 && paymentTotalCents === totalPreviewCents;
  const paymentAllocationsValid = paymentRowsValid && paymentAmountRuleValid && totalPreviewCents > 0;
  const paymentAllocationsJson = JSON.stringify(paymentSplits.map(({ financialAccountId, amount }) => ({ financialAccountId, amount })));

  function addQuantityItem(item: CatalogItem) {
    const currentlyAdded = stockRequestedByVariant.get(item.variantId) ?? 0;
    if (currentlyAdded >= item.stockQuantity) return;
    const key = `${item.variantId}:quantity`;
    setCart((current) => {
      const existing = current.find((line) => cartKey(line) === key);
      if (existing) return current.map((line) => cartKey(line) === key ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { variantId: item.variantId, quantity: 1, imeiDeviceId: null }];
    });
  }

  function addImeiDevice(item: CatalogItem) {
    const deviceId = selectedDevices[item.variantId];
    if (!deviceId || cart.some((line) => line.imeiDeviceId === deviceId)) return;
    if ((stockRequestedByVariant.get(item.variantId) ?? 0) >= item.stockQuantity) return;
    setCart((current) => [...current, { variantId: item.variantId, quantity: 1, imeiDeviceId: deviceId }]);
  }

  function addPaymentSplit() {
    if (paymentSplits.length >= 10) return;
    const usedIds = new Set(paymentSplits.map((payment) => payment.financialAccountId));
    const nextAccount = paymentAccounts.find((account) => !usedIds.has(account.id));
    if (!nextAccount) return;
    setPaymentSplits((current) => [...current, {
      key: String(nextPaymentKey),
      financialAccountId: nextAccount.id,
      amount: "",
    }]);
    setNextPaymentKey((current) => current + 1);
  }

  function removePaymentSplit(key: string) {
    setPaymentSplits((current) => {
      if (current.length <= 1 && !allowCreditBalance) return current;
      return current.filter((payment) => payment.key !== key);
    });
  }

  function changeCreditMode(enabled: boolean) {
    setAllowCreditBalance(enabled);
    if (!enabled && paymentSplits.length === 0 && defaultPaymentAccountId) {
      setPaymentSplits([{ key: String(nextPaymentKey), financialAccountId: defaultPaymentAccountId, amount: (totalPreviewCents / 100).toFixed(2) }]);
      setNextPaymentKey((current) => current + 1);
    }
  }

  function changeQuantity(key: string, delta: number) {
    setCart((current) => current.flatMap((line) => {
      if (cartKey(line) !== key) return [line];
      const next = line.quantity + delta;
      if (next < 1) return [];
      const item = catalog.find((candidate) => candidate.variantId === line.variantId);
      if (next > (item?.stockQuantity ?? 0)) return [line];
      return [{ ...line, quantity: next }];
    }));
  }

  function removeLine(key: string) {
    setCart((current) => current.filter((line) => cartKey(line) !== key));
  }

  const cartJson = JSON.stringify(cart);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
      <section className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
        <div>
          <h2 className="font-semibold">Products</h2>
          <p className="mt-1 text-sm text-muted-foreground">Search by product, variant, SKU, or barcode. Only posted stock is available to sell.</p>
        </div>
        <label className="block">
          <span className="sr-only">Search products</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, SKU, or scan barcode…"
            className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          {filteredCatalog.map((item) => {
            const alreadyAdded = stockRequestedByVariant.get(item.variantId) ?? 0;
            const devicesForItem = availableDevicesByVariant.get(item.variantId) ?? [];
            const selectedIsInCart = cart.some((line) => line.imeiDeviceId === selectedDevices[item.variantId]);
            const disabled = item.stockQuantity <= alreadyAdded;
            return (
              <article key={item.variantId} className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
                <div className="min-w-0">
                  <h3 className="font-medium">{item.productName}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.variantName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">SKU: {item.sku}{item.barcode ? ` · Barcode: ${item.barcode}` : ""}</p>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="font-semibold tabular-nums">{formatPKR(item.sellingPrice)}</p>
                    <p className={`mt-1 text-xs ${item.stockQuantity <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {item.stockQuantity} in stock{item.trackByImei ? " · IMEI tracked" : ""}
                    </p>
                  </div>
                  {!item.trackByImei ? (
                    <button type="button" onClick={() => addQuantityItem(item)} disabled={disabled} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
                      Add item
                    </button>
                  ) : null}
                </div>
                {item.trackByImei ? (
                  <div className="space-y-2 border-t pt-3">
                    <label className="block text-xs font-medium" htmlFor={`device-${item.variantId}`}>Select actual device</label>
                    <select
                      id={`device-${item.variantId}`}
                      value={selectedDevices[item.variantId] ?? ""}
                      onChange={(event) => setSelectedDevices((current) => ({ ...current, [item.variantId]: event.target.value }))}
                      disabled={disabled || devicesForItem.length === 0}
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="">{devicesForItem.length ? "Choose IMEI / serial" : "No in-stock device record"}</option>
                      {devicesForItem.map((device) => (
                        <option key={device.id} value={device.id} disabled={cart.some((line) => line.imeiDeviceId === device.id)}>
                          {device.imei1}{device.serialNumber ? ` · ${device.serialNumber}` : ""}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => addImeiDevice(item)} disabled={disabled || !selectedDevices[item.variantId] || selectedIsInCart || devicesForItem.length === 0} className="w-full rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
                      Add selected device
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
          {filteredCatalog.length === 0 ? (
            <div className="col-span-full rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No matching product variants.</div>
          ) : null}
        </div>
      </section>

      <form
        action={formAction}
        onSubmit={(event) => {
          if (cart.length === 0) {
            event.preventDefault();
            return;
          }
          if (!paymentAllocationsValid) {
            event.preventDefault();
            return;
          }
          const outstanding = outstandingPreviewCents / 100;
          const creditText = outstanding > 0 ? ` Outstanding customer balance: ${formatPKR(outstanding)}.` : " No outstanding balance.";
          if (!window.confirm(`Complete sale for ${formatPKR(totalPreview)}? Money recorded as received: ${formatPKR(paymentTotalCents / 100)}.${creditText} Stock and the accounting ledger will be updated.`)) event.preventDefault();
        }}
        className="space-y-4 rounded-xl border bg-card p-4 md:sticky md:top-4 md:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Current sale</h2>
            <p className="mt-1 text-sm text-muted-foreground">{totalUnits} unit(s) · {cart.length} cart line(s)</p>
          </div>
          <button type="button" onClick={() => { setCart([]); setDiscountAmount("0.00"); setPaymentSplits([{ key: "1", financialAccountId: defaultPaymentAccountId, amount: "0.00" }]); setNextPaymentKey(2); }} disabled={cart.length === 0 || pending} className="text-sm font-medium text-muted-foreground underline underline-offset-4 disabled:opacity-50">Clear cart</button>
        </div>

        <input type="hidden" name="cartJson" value={cartJson} />
        <input type="hidden" name="paymentAllocationsJson" value={paymentAllocationsJson} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="allowCreditBalance" value={allowCreditBalance ? "true" : "false"} />

        {cart.length ? (
          <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
            {cart.map((line) => {
              const item = catalog.find((candidate) => candidate.variantId === line.variantId);
              const device = line.imeiDeviceId ? devices.find((candidate) => candidate.id === line.imeiDeviceId) : undefined;
              const key = cartKey(line);
              const lineTotal = Number(item?.sellingPrice ?? 0) * line.quantity;
              return (
                <div key={key} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item?.productName ?? "Product unavailable"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item?.variantName}{device ? ` · IMEI ${device.imei1}` : ""}</p>
                    </div>
                    <button type="button" onClick={() => removeLine(key)} aria-label="Remove item" disabled={pending} className="text-xs text-destructive underline underline-offset-4">Remove</button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    {!line.imeiDeviceId ? (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => changeQuantity(key, -1)} disabled={pending} className="size-8 rounded-md border" aria-label="Decrease quantity">−</button>
                        <span className="min-w-5 text-center text-sm tabular-nums">{line.quantity}</span>
                        <button type="button" onClick={() => changeQuantity(key, 1)} disabled={pending || line.quantity >= (item?.stockQuantity ?? 0)} className="size-8 rounded-md border disabled:opacity-40" aria-label="Increase quantity">+</button>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">1 device</span>}
                    <span className="text-sm font-semibold tabular-nums">{formatPKR(lineTotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-7 text-center text-sm text-muted-foreground">Add products to begin a sale.</div>
        )}

        <div className="space-y-2 border-t pt-4">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatPKR(subtotal)}</span></div>
          <label className="grid grid-cols-[1fr_140px] items-center gap-3 text-sm" htmlFor="sale-discount">
            <span className="text-muted-foreground">Sale discount (Rs)</span>
            <input id="sale-discount" name="discountAmount" inputMode="decimal" type="number" min="0" max={subtotal.toFixed(2)} step="0.01" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} disabled={pending} className="h-10 w-full rounded-md border bg-background px-2 text-right tabular-nums" />
          </label>
          <div className="flex justify-between border-t pt-3"><span className="font-semibold">Total due</span><span className="text-xl font-semibold tabular-nums">{formatPKR(totalPreview)}</span></div>
        </div>

        <section className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="sale-customer" className="text-sm font-semibold">Customer</label>
            <Link href="/customers" className="text-xs font-medium underline underline-offset-4">Manage customers</Link>
          </div>
          <select id="sale-customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)} disabled={pending} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">Walk-in customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">A customer is required whenever any part of the sale remains unpaid.</p>
        </section>

        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Payment received</h3>
              <p className="mt-1 text-xs text-muted-foreground">{allowCreditBalance ? "Record only the money actually received. The remaining balance is posted to Accounts Receivable." : "Allocate the full sale total to the account(s) that actually received the money."}</p>
            </div>
            <button
              type="button"
              onClick={addPaymentSplit}
              disabled={pending || paymentSplits.length >= Math.min(10, paymentAccounts.length) || paymentAccounts.every((account) => paymentSplits.some((payment) => payment.financialAccountId === account.id))}
              className="shrink-0 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {paymentSplits.length === 0 ? "Add payment" : "Add split"}
            </button>
          </div>

          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <input type="checkbox" checked={allowCreditBalance} onChange={(event) => changeCreditMode(event.target.checked)} disabled={pending} className="mt-0.5 size-4" />
            <span><span className="font-medium">Allow customer credit / leave balance unpaid</span><span className="mt-1 block text-xs text-muted-foreground">Requires a customer when the received payments are less than the sale total. The unpaid amount will be recorded in Accounts Receivable.</span></span>
          </label>

          <div className="space-y-3">
            {paymentSplits.map((payment, index) => {
              const amountCents = paymentAmountCents(payment.amount);
              const usedByOtherSplit = new Set(paymentSplits.filter((entry) => entry.key !== payment.key).map((entry) => entry.financialAccountId));
              return (
                <div key={payment.key} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={`payment-account-${payment.key}`} className="text-xs font-medium">Payment {index + 1} account</label>
                    {paymentSplits.length > 1 || allowCreditBalance ? (
                      <button type="button" onClick={() => removePaymentSplit(payment.key)} disabled={pending} className="text-xs text-destructive underline underline-offset-4">Remove</button>
                    ) : null}
                  </div>
                  <select
                    id={`payment-account-${payment.key}`}
                    value={payment.financialAccountId}
                    onChange={(event) => setPaymentSplits((current) => current.map((entry) => entry.key === payment.key ? { ...entry, financialAccountId: event.target.value } : entry))}
                    disabled={pending}
                    required
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="" disabled>Select financial account</option>
                    {paymentAccounts.map((account) => (
                      <option key={account.id} value={account.id} disabled={usedByOtherSplit.has(account.id)}>
                        {account.name} · {account.kind.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <label htmlFor={`payment-amount-${payment.key}`} className="text-xs font-medium">Amount received (Rs)</label>
                  <input
                    id={`payment-amount-${payment.key}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    required
                    readOnly={paymentSplits.length === 1 && !allowCreditBalance}
                    value={payment.amount}
                    onChange={(event) => setPaymentSplits((current) => current.map((entry) => entry.key === payment.key ? { ...entry, amount: event.target.value } : entry))}
                    disabled={pending}
                    className="h-10 w-full rounded-md border bg-background px-3 text-right text-sm tabular-nums read-only:bg-muted"
                  />
                  {paymentSplits.length === 1 && !allowCreditBalance ? <p className="text-xs text-muted-foreground">Single-payment mode automatically matches the full total. Add a split to enter multiple amounts.</p> : null}
                  {Number.isSafeInteger(amountCents) && amountCents > 0 ? <p className="text-right text-xs text-muted-foreground">{formatPKR(amountCents / 100)}</p> : null}
                </div>
              );
            })}
          </div>

          {paymentSplits.length === 0 ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{allowCreditBalance ? "No payment recorded yet. This sale will be entirely on customer credit." : "No payment rows are available. Enable customer credit or configure a receiving account."}</p> : null}

          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3 text-sm">
            <span className="text-muted-foreground">Received / total</span>
            <span className={`font-semibold tabular-nums ${paymentAllocationsValid ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>
              {formatPKR(paymentTotalCents / 100)} / {formatPKR(totalPreview)}
            </span>
          </div>
          {allowCreditBalance ? <div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">Customer balance to collect</span><span className="font-semibold tabular-nums">{formatPKR(outstandingPreviewCents / 100)}</span></div> : null}
          {!paymentAllocationsValid && cart.length > 0 ? (
            <p role="status" className="text-xs text-destructive">{allowCreditBalance && outstandingPreviewCents > 0 && !customerId ? "Select a customer before leaving a credit balance." : allowCreditBalance ? "Received amounts must be positive, use different accounts, and must not exceed the total." : "Payment amounts must be positive, use different accounts, and add up exactly to the total due."}</p>
          ) : null}
        </section>

        {state.status !== "idle" ? (
          <div role="status" className={`rounded-md border p-3 text-sm ${state.status === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
            <p>{state.message}</p>
            {state.status === "success" && state.saleId ? <Link className="mt-2 inline-flex font-medium underline underline-offset-4" href={`/sales/${state.saleId}`}>View receipt for {state.documentNo}</Link> : null}
          </div>
        ) : null}

        <button type="submit" disabled={pending || cart.length === 0 || !paymentAllocationsValid} className="h-11 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Completing sale…" : `Complete sale · ${formatPKR(totalPreview)}`}
        </button>
        <p className="text-xs text-muted-foreground">Final pricing, customer eligibility, payment allocation, discount allocation, device availability, inventory, receivables, and ledger posting are validated on the server. A failure rolls back the checkout transaction.</p>
      </form>
    </div>
  );
}
