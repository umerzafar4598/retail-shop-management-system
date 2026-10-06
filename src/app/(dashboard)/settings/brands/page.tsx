import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/authorization";

import BrandForm from "./brand-form";
import BrandRow from "./brand-row";

type Brand = {
    id: string;
    name: string;
    active: boolean;
};

export default async function BrandsPage() {
    const context = await requirePermission("products.view");

    const result = await db.execute<Brand>(
        sql`
      SELECT
        id,
        name,
        active
      FROM brands
      WHERE shop_id = ${context.shopId}
      ORDER BY name ASC
    `,
    );

    return (
        <main className="mx-auto max-w-4xl px-6 py-8">
            <div className="mb-8">
                <h1 className="text-2xl font-semibold">
                    Brands
                </h1>

                <p className="mt-2 text-sm text-slate-500">
                    Manage mobile and accessory brands for {context.shopName}.
                </p>
            </div>

            <div className="mb-8">
                <BrandForm />
            </div>

            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="border-b px-6 py-4">
                    <h2 className="font-semibold">
                        Brands
                    </h2>
                </div>

                {result.rows.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-slate-500">
                        No brands have been added yet.
                    </div>
                ) : (
                    <div className="divide-y">
                        {result.rows.map((brand) => (
                            <BrandRow
                                key={brand.id}
                                brand={brand}
                            />
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}