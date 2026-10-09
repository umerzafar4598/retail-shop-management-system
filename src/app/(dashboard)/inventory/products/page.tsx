import {
    hasPermission,
    requirePermission,
} from "@/lib/authorization";
import {
    getCurrentSession,
} from "@/lib/session";

import {
    getProductFormOptions,
    listProducts,
} from "@/lib/inventory/catalog";

import { ProductForm } from "./product-form";
import { ProductRow } from "./product-row";

export default async function ProductsPage() {
    const context = await requirePermission(
        "products.view",
    );

    const session =
        await getCurrentSession();

    if (!session) {
        throw new Error(
            "Authenticated session unexpectedly disappeared.",
        );
    }

    const [
        options,
        products,
        canCreate,
        canUpdate,
    ] = await Promise.all([
        getProductFormOptions(),
        listProducts(),

        hasPermission(
            session.user.id,
            context.shopId,
            "products.create",
        ),

        hasPermission(
            session.user.id,
            context.shopId,
            "products.update",
        ),
    ]);

    return (
        <main className="space-y-6">
            <div>
                <p className="text-sm text-muted-foreground">
                    Inventory
                </p>

                <h1 className="text-2xl font-semibold tracking-tight">
                    Products
                </h1>

                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    Manage products and their variants for{" "}
                    {context.shopName}. Inventory quantity will be
                    changed through inventory transactions, not by
                    directly editing this catalog.
                </p>
            </div>

            {canCreate ? (
                <ProductForm options={options} />
            ) : null}

            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">
                            Product Catalog
                        </h2>

                        <p className="text-sm text-muted-foreground">
                            {products.length}{" "}
                            {products.length === 1
                                ? "product"
                                : "products"}
                        </p>
                    </div>
                </div>

                {products.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center">
                        <p className="font-medium">
                            No products yet.
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                            Create your first phone or accessory above.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {products.map((product) => (
                            <ProductRow
                                key={product.id}
                                product={product}
                                canUpdate={canUpdate}
                            />
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}