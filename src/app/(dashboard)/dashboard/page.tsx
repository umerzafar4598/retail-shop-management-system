import LogoutButton from "./logout-button";

import { requirePermission } from "@/lib/authorization";
import { getCurrentSession } from "@/lib/session";

export default async function DashboardPage() {
    const context = await requirePermission("dashboard.view");
    const session = await getCurrentSession();

    return (
        <main className="min-h-screen bg-slate-50">
            <header className="border-b bg-white">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div>
                        <h1 className="text-lg font-semibold">
                            {context.shopName}
                        </h1>

                        <p className="text-sm text-slate-500">
                            Management Dashboard
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden text-right sm:block">
                            <p className="text-sm font-medium">
                                {session?.user.name}
                            </p>

                            <p className="text-xs text-slate-500">
                                {context.roleName}
                            </p>
                        </div>

                        <LogoutButton />
                    </div>
                </div>
            </header>

            <section className="mx-auto max-w-7xl px-6 py-10">
                <div className="grid gap-6 md:grid-cols-3">
                    <div className="rounded-2xl border bg-white p-6 shadow-sm">
                        <p className="text-sm text-slate-500">
                            Shop
                        </p>

                        <p className="mt-2 text-xl font-semibold">
                            {context.shopName}
                        </p>
                    </div>

                    <div className="rounded-2xl border bg-white p-6 shadow-sm">
                        <p className="text-sm text-slate-500">
                            Your role
                        </p>

                        <p className="mt-2 text-xl font-semibold">
                            {context.roleName}
                        </p>
                    </div>

                    <div className="rounded-2xl border bg-white p-6 shadow-sm">
                        <p className="text-sm text-slate-500">
                            Currency
                        </p>

                        <p className="mt-2 text-xl font-semibold">
                            PKR
                        </p>
                    </div>
                </div>

                <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-semibold">
                        System foundation
                    </h2>

                    <p className="mt-2 text-sm text-slate-500">
                        Authentication, shop context, and role-based
                        authorization are active.
                    </p>
                </div>
            </section>
        </main>
    );
}