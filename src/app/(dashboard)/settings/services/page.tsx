import Link from "next/link";

import { requirePermission } from "@/lib/authorization";
import { getServiceTypeSettingsForShop } from "@/lib/shop-services/service-transactions";
import ServiceTypeCreateForm from "./service-type-create-form";
import ServiceTypeRow from "./service-type-row";

export default async function ServiceSettingsPage() {
  const shop = await requirePermission("services.manage_types");
  const types = await getServiceTypeSettingsForShop(shop.shopId);
  return <main className="space-y-6 p-4 md:p-6"><header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm text-muted-foreground">Settings / operations</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Service types</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Configure standard and custom shop services and their default fees. Provider direction controls which financial accounts participate in the service journal. No provider APIs are called.</p></div><Link href="/services" className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted">Back to services</Link></header>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"><div className="space-y-3"><h2 className="font-semibold">Configured types ({types.length})</h2><p className="text-sm text-muted-foreground">Inactive types stay linked to historical records but cannot be selected for new transactions. The built-in types are inserted automatically on first visit.</p>{types.map((type) => <ServiceTypeRow key={type.id} type={type} />)}</div><ServiceTypeCreateForm /></div>
  </main>;
}
