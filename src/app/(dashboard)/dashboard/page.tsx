import { requirePermission } from "@/lib/authorization";
import LogoutButton from "./logout-button";

export default async function DashboardPage() {
    const context = await requirePermission("dashboard.view");

    return (
        <main className="min-h-screen bg-slate-50">
            <header className="border-b bg-white">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div>
                        <h1 className="text-lg font-semibold">
                            Hamid Mobiles & Communications
                        </h1>

                        <p className="text-sm text-slate-500">
                            Management Dashboard
                        </p>
                    </div>

                    <LogoutButton />
                </div>
            </header>

            <section className="mx-auto max-w-7xl px-6 py-10">
                <div className="rounded-2xl border bg-white p-6 shadow-sm">
                    <p className="text-sm text-slate-500">
                        Signed in as
                    </p>

                    <h2 className="mt-1 text-2xl font-semibold">
                        {context.shopName}
                    </h2>

                    <p className="mt-2 text-sm text-slate-600">
                        Role: {context.roleName}
                    </p>

                    <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm">
                        <p>
                            Authentication is working successfully.
                        </p>

                        <p className="mt-1 text-slate-500">
                            Role and shop-membership authorization will be enforced next.
                        </p>
                    </div>
                </div>
            </section>
        </main>
    );
}