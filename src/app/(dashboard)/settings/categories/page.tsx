import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { requirePermission } from "@/lib/authorization";

import CategoryForm from "./category-form";
import CategoryRow from "./category-row";

type Category = {
    id: string;
    parentId: string | null;
    name: string;
    active: boolean;
};

export default async function CategoriesPage() {
    const context = await requirePermission("products.view");

    const result = await db.execute<Category>(
        sql`
      SELECT
        id,
        parent_id AS "parentId",
        name,
        active
      FROM categories
      WHERE shop_id = ${context.shopId}
      ORDER BY name ASC
    `,
    );

    return (
        <main className="mx-auto max-w-4xl px-6 py-8">
            <div className="mb-8">
                <h1 className="text-2xl font-semibold">
                    Categories
                </h1>

                <p className="mt-2 text-sm text-slate-500">
                    Organize phones and accessories into product categories.
                </p>
            </div>

            <div className="mb-8">
                <CategoryForm
                    categories={result.rows
                        .filter((category) => category.active)
                        .map((category) => ({
                            id: category.id,
                            name: category.name,
                        }))}
                />
            </div>

            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="border-b px-6 py-4">
                    <h2 className="font-semibold">
                        Categories
                    </h2>
                </div>

                {result.rows.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-slate-500">
                        No categories have been added yet.
                    </div>
                ) : (
                    <div className="divide-y">
                        {result.rows.map((category) => {
                            const parent = result.rows.find(
                                (item) => item.id === category.parentId,
                            );

                            return (
                                <CategoryRow
                                    key={category.id}
                                    category={category}
                                    parentName={parent?.name ?? null}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}