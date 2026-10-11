"use client";

import { useActionState, useState } from "react";
import { createSaleReturnAction, type SaleReturnActionState } from "../../return-actions";

type ReturnableItem = {
  id: string;
  description: string;
  quantity: number;
  remainingQuantity: number;
  lineTotal: string;
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
};
type PaymentAccount = { id: string; name: string; kind: string };
type LocalLine = { quantity: number; condition: "RESTOCK" | "DAMAGED" | "OTHER" };
const initialState: SaleReturnActionState = { status: "idle", message: "" };

export default function SaleReturnForm({ saleId, documentNo, items, paymentAccounts }: {
  saleId: string;
  documentNo: string;
  items: ReturnableItem[];
  paymentAccounts: PaymentAccount[];
}) {
  const [state, formAction, pending] = useActionState(createSaleReturnAction, initialState);
  const [selection, setSelection] = useState<Record<string, LocalLine>>(() => Object.fromEntries(items.map((item) => [item.id, { quantity: 0, condition: "RESTOCK" as const }])));
  const selected = items.filter((item) => (selection[item.id]?.quantity ?? 0) > 0).map((item) => ({ saleItemId: item.id, quantity: selection[item.id].quantity, condition: selection[item.id].condition }));
  const itemsJson = JSON.stringify(selected);
  if (state.status === "success") {
    return <section className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><h2 className="font-semibold">Return recorded</h2><p className="text-sm">{state.message}</p><a href={`/sales/${saleId}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium">Back to receipt</a></section>;
  }

  return (
    <form action={formAction} onSubmit={(event) => {
      if (selected.length === 0) { event.preventDefault(); return; }
      if (!window.confirm(`Record this return against ${documentNo}? Only enter items that have actually been accepted back from the customer. This action will update inventory and the ledger.`)) event.preventDefault();
    }} className="space-y-5 rounded-xl border bg-card p-4 md:p-5">
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <div><h2 className="text-lg font-semibold">Return items from {documentNo}</h2><p className="mt-1 text-sm text-muted-foreground">Choose the quantity accepted back and its condition. Only RESTOCK items are added to sellable inventory and reverse their recorded COGS.</p></div>
      <div className="space-y-3">
        {items.map((item) => {
          const current = selection[item.id] ?? { quantity: 0, condition: "RESTOCK" as const };
          return <div key={item.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="font-medium">{item.description}</p>{item.imei1 ? <p className="mt-1 text-xs text-muted-foreground">IMEI: {item.imei1}{item.imei2 ? ` / ${item.imei2}` : ""}{item.serialNumber ? ` · Serial ${item.serialNumber}` : ""}</p> : null}<p className="mt-1 text-sm text-muted-foreground">Sold: {item.quantity} · Remaining returnable: {item.remainingQuantity} · Original line total: Rs {item.lineTotal}</p></div><label className="w-28 space-y-1 text-sm"><span className="font-medium">Return qty</span><input type="number" min={0} max={item.remainingQuantity} step={1} value={current.quantity} disabled={pending || item.remainingQuantity === 0} onChange={(event) => setSelection((previous) => ({ ...previous, [item.id]: { ...current, quantity: Math.max(0, Math.min(item.remainingQuantity, Number.parseInt(event.target.value || "0", 10) || 0)) } }))} className="h-10 w-full rounded-md border bg-background px-3 text-right tabular-nums" /></label></div>
            <label className="mt-3 block space-y-1 text-sm"><span className="font-medium">Item condition</span><select value={current.condition} disabled={pending || current.quantity === 0} onChange={(event) => setSelection((previous) => ({ ...previous, [item.id]: { ...current, condition: event.target.value as LocalLine["condition"] } }))} className="h-10 w-full rounded-md border bg-background px-3"><option value="RESTOCK">Good — return to sellable stock</option><option value="DAMAGED">Damaged — do not restock</option><option value="OTHER">Other — do not restock</option></select></label>
          </div>;
        })}
      </div>
      <label className="block space-y-1 text-sm"><span className="font-medium">Reason (optional)</span><textarea name="reason" maxLength={500} rows={2} disabled={pending} className="w-full rounded-md border bg-background px-3 py-2" placeholder="Customer return reason, defect, wrong item…" /></label>
      <label className="block space-y-1 text-sm"><span className="font-medium">Refund paid from (only required if a cash refund is due)</span><select name="refundFinancialAccountId" defaultValue="" disabled={pending} className="h-10 w-full rounded-md border bg-background px-3"><option value="">No cash refund / apply to customer balance</option>{paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.kind.replaceAll("_", " ")}</option>)}</select><span className="text-xs text-muted-foreground">For credit sales, the return first reduces outstanding customer receivables. Only the amount exceeding the remaining balance is refunded from the selected account.</span></label>
      {state.status === "error" ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{state.message}</div> : null}
      <button type="submit" disabled={pending || selected.length === 0} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Recording return…" : "Complete return"}</button>
    </form>
  );
}
