"use client";

import { useActionState } from "react";
import { transitionServiceTransactionAction, type ServiceActionState } from "../actions";

type Account = { id: string; name: string; kind: string; provider: string };
const initialState: ServiceActionState = { status: "idle", message: "" };

export default function ServiceStatusPanel({ serviceId, documentNo, direction, serviceStatus, externalReference, accounts, defaultServiceCashDrawerId, initialReceivingAccountId, canProcess, canComplete, canCancel }: {
  serviceId: string;
  documentNo: string;
  direction: "IN" | "OUT" | "NONE";
  serviceStatus: string;
  externalReference: string | null;
  accounts: Account[];
  defaultServiceCashDrawerId: string | null;
  initialReceivingAccountId: string | null;
  canProcess: boolean;
  canComplete: boolean;
  canCancel: boolean;
}) {
  const [processState, processAction, processing] = useActionState(transitionServiceTransactionAction, initialState);
  const [completeState, completeAction, completing] = useActionState(transitionServiceTransactionAction, initialState);
  const [refundState, refundAction, refunding] = useActionState(transitionServiceTransactionAction, initialState);
  if (!(serviceStatus === "PENDING" || serviceStatus === "PROCESSING")) return null;
  return <section className="space-y-4 rounded-xl border bg-card p-4 md:p-5"><div><h2 className="text-lg font-semibold">Update service status</h2><p className="mt-1 text-sm text-muted-foreground">Complete only after the real provider operation and any required customer payout have occurred. Failed/cancelled pending services must be refunded to reverse the money held in Service Clearing.</p></div>
    {serviceStatus === "PENDING" && canProcess ? <form action={processAction} className="rounded-lg border p-3"><input type="hidden" name="serviceId" value={serviceId} /><input type="hidden" name="action" value="PROCESSING" /><button type="submit" disabled={processing} className="h-9 rounded-md border px-3 text-sm font-medium disabled:opacity-50">{processing ? "Updating…" : "Mark processing"}</button>{processState.message ? <p role="status" className={`mt-2 text-sm ${processState.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{processState.message}</p> : null}</form> : null}

    {canComplete ? <form action={completeAction} className="space-y-3 rounded-lg border p-3"><input type="hidden" name="serviceId" value={serviceId} /><input type="hidden" name="action" value="COMPLETED" /><div><h3 className="font-semibold">Complete service</h3><p className="mt-1 text-sm text-muted-foreground">The server releases the pending clearing amount, records the provider/payout movement and recognizes the service fee.</p></div>
      {direction === "IN" ? <label className="block space-y-1 text-sm"><span className="font-medium">Account used to pay principal to customer</span><select name="accountId" required disabled={completing} defaultValue={defaultServiceCashDrawerId ?? ""} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Select payout account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.provider} · {account.kind.replaceAll("_", " ")}</option>)}</select><span className="text-xs text-muted-foreground">The selected account is credited for the cash/principal amount paid out.</span></label> : null}
      <label className="block space-y-1 text-sm"><span className="font-medium">External provider reference (optional)</span><input type="text" name="externalReference" maxLength={150} defaultValue={externalReference ?? ""} disabled={completing} className="h-10 w-full rounded-md border bg-background px-3" placeholder="Provider transaction / receipt reference" /></label>
      {completeState.status === "error" ? <p role="alert" className="text-sm text-destructive">{completeState.message}</p> : completeState.status === "success" ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{completeState.message}</p> : null}
      <button type="submit" disabled={completing} onClick={(event) => { if (!window.confirm(`Mark ${documentNo} completed? This posts the final provider/payout movement and service revenue to the ledger.`)) event.preventDefault(); }} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{completing ? "Completing…" : "Mark completed"}</button>
    </form> : null}

    {canCancel ? <form action={refundAction} className="space-y-3 rounded-lg border border-destructive/25 p-3"><div><h3 className="font-semibold">Fail or cancel and refund</h3><p className="mt-1 text-sm text-muted-foreground">Only use this when the provider operation has not been completed and the customer funds are actually being returned. This action posts a refund and closes the pending service.</p></div>
      {direction === "IN" ? <p className="rounded-md bg-muted/50 p-3 text-sm">The refund journal reverses the incoming funds from the provider account {`for this service`}. Ensure the provider transfer was actually returned externally first.</p> : <label className="block space-y-1 text-sm"><span className="font-medium">Account to refund customer from</span><select name="accountId" required disabled={refunding} defaultValue={initialReceivingAccountId ?? defaultServiceCashDrawerId ?? ""} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Select refund account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.provider} · {account.kind.replaceAll("_", " ")}</option>)}</select></label>}
      <label className="block space-y-1 text-sm"><span className="font-medium">Failure / cancellation reason</span><textarea name="reason" required minLength={2} maxLength={500} rows={2} disabled={refunding} className="w-full rounded-md border bg-background px-3 py-2" placeholder="Why did the external service fail or get cancelled?" /></label>
      {refundState.status === "error" ? <p role="alert" className="text-sm text-destructive">{refundState.message}</p> : refundState.status === "success" ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{refundState.message}</p> : null}
      <div className="flex flex-wrap gap-2"><button type="submit" name="action" value="FAILED" disabled={refunding} onClick={(event) => { if (!window.confirm(`Mark ${documentNo} FAILED and post the full refund? Continue only after the real refund/transfer reversal is complete.`)) event.preventDefault(); }} className="h-10 rounded-md border border-destructive/40 px-4 text-sm font-medium text-destructive disabled:opacity-50">{refunding ? "Posting refund…" : "Mark failed + refund"}</button><button type="submit" name="action" value="CANCELLED" disabled={refunding} onClick={(event) => { if (!window.confirm(`Cancel ${documentNo} and post the full refund? Continue only when the funds have actually been returned.`)) event.preventDefault(); }} className="h-10 rounded-md border px-4 text-sm font-medium disabled:opacity-50">Cancel service + refund</button></div>
    </form> : null}
  </section>;
}
