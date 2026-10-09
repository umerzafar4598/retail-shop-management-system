import { requireSession } from "@/lib/session";
import { hasPermission, requirePermission } from "@/lib/authorization";
import { listSuppliers } from "@/lib/suppliers/suppliers";

import SupplierForm from "./supplier-form";
import SupplierRow from "./supplier-row";

export default async function SuppliersPage() {
    const session = await requireSession();
    const shop = await requirePermission("products.view");

    const [suppliers, canCreate, canUpdate] = await Promise.all([
        listSuppliers(shop.shopId),
        hasPermission(session.user.id, shop.shopId, "products.create"),
        hasPermission(session.user.id, shop.shopId, "products.update"),
    ]);

    const activeCount = suppliers.filter(
        (supplier) => supplier.active,
    ).length;

    const inactiveCount = suppliers.length - activeCount;

    return (
        <main className="space-y-6 p-4 md:p-6">
            <header>
                <p className="text-sm text-muted-foreground">
                    Settings / Purchasing
                </p>

                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                    Suppliers
                </h1>

                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    Maintain the suppliers your shop purchases phones and
                    accessories from. Inactive suppliers remain available in
                    historical records.
                </p>
            </header>

            <section className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                        Total Suppliers
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                        {suppliers.length}
                    </p>
                </div>

                <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                        Active
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                        {activeCount}
                    </p>
                </div>

                <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                        Inactive
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                        {inactiveCount}
                    </p>
                </div>
            </section>

            {canCreate ? <SupplierForm /> : null}

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="border-b p-4 md:p-5">
                    <h2 className="font-semibold">Supplier Directory</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Contact details and current status.
                    </p>
                </div>

                {suppliers.length === 0 ? (
                    <div className="p-10 text-center">
                        <h3 className="font-medium">No suppliers recorded yet</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Add a supplier above to begin recording purchases.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-212.5 text-left text-sm">
                            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th scope="col" className="px-4 py-3">
                                        Supplier
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Phone
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Address
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Notes
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        Status
                                    </th>
                                    {canUpdate ? (
                                        <th scope="col" className="px-4 py-3">
                                            Actions
                                        </th>
                                    ) : null}
                                </tr>
                            </thead>

                            <tbody className="divide-y">
                                {suppliers.map((supplier) => (
                                    <SupplierRow
                                        key={supplier.id}
                                        supplier={supplier}
                                        canUpdate={canUpdate}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    );
}