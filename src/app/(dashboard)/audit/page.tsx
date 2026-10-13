import Link from "next/link";

import { listAuditHistory } from "@/lib/audit/audit-history";

type SearchValue = string | string[] | undefined;
type AuditPageProps = {
  searchParams?: Promise<{
    q?: SearchValue;
    action?: SearchValue;
    entity?: SearchValue;
  }>;
};

function firstValue(value: SearchValue) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function displayActor(entry: {
  actorName: string | null;
  actorEmail: string | null;
  actorUserId: string;
}) {
  if (entry.actorName && entry.actorEmail) return `${entry.actorName} (${entry.actorEmail})`;
  if (entry.actorName) return entry.actorName;
  if (entry.actorEmail) return entry.actorEmail;
  return `Unknown user · ${entry.actorUserId.slice(0, 8)}`;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const report = await listAuditHistory({
    query: firstValue(params?.q),
    action: firstValue(params?.action),
    entityType: firstValue(params?.entity),
  });

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{report.shopName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Audit history</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Read-only history of recorded business and administrative actions. Records are scoped to this shop and the latest 100 matching events are shown.
          </p>
        </div>
        <Link href="/dashboard" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Back to dashboard</Link>
      </header>

      <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[2fr_1fr_1fr_auto_auto] md:items-end">
        <div className="space-y-1">
          <label htmlFor="audit-q" className="text-sm font-medium text-slate-700">Search</label>
          <input id="audit-q" name="q" defaultValue={report.filters.query} maxLength={100} placeholder="Action, actor, document ID, or details" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700" />
        </div>
        <div className="space-y-1">
          <label htmlFor="audit-action" className="text-sm font-medium text-slate-700">Action</label>
          <input id="audit-action" name="action" defaultValue={report.filters.action} maxLength={80} placeholder="e.g. SALE_COMPLETED" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700" />
        </div>
        <div className="space-y-1">
          <label htmlFor="audit-entity" className="text-sm font-medium text-slate-700">Entity type</label>
          <input id="audit-entity" name="entity" defaultValue={report.filters.entityType} maxLength={80} placeholder="e.g. SALE" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700" />
        </div>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Search</button>
        <Link href="/audit" className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">Clear</Link>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Recorded events</h2>
          <p className="text-xs text-slate-500">{report.entries.length} event(s) · newest first</p>
        </div>
        {report.entries.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="font-medium text-slate-800">No audit events match these filters.</p>
            <p className="mt-1 text-sm text-slate-500">Try a shorter search or clear the filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {report.entries.map((entry) => (
              <article key={entry.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[190px_1fr_1.2fr]">
                <div>
                  <p className="text-sm font-medium text-slate-900">{formatDateTime(entry.createdAt)}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">{entry.id}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{entry.action}</p>
                  <p className="mt-1 text-sm text-slate-600">{displayActor(entry)}</p>
                  <p className="mt-1 text-xs text-slate-500">Actor ID: {entry.actorUserId}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {entry.entityType ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{entry.entityType}</span> : null}
                    {entry.entityId ? <span className="break-all rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{entry.entityId}</span> : null}
                  </div>
                </div>
                <div className="min-w-0">
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4">View event details</summary>
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{JSON.stringify(entry.metadata ?? {}, null, 2)}</pre>
                  </details>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="text-xs leading-5 text-slate-500">Audit history is for accountability, not a replacement for the financial ledger or inventory movement history. Sensitive credentials and passwords must never be stored in audit metadata.</p>
    </main>
  );
}
