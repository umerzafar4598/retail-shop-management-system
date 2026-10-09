import "server-only";

import Decimal from "decimal.js";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
    brands,
    categories,
    inventoryBalances,
    productVariants,
    products,
} from "@/db/schema";
import { requirePermission } from "@/lib/authorization";

export type InventoryStockStatus =
    | "IN_STOCK"
    | "LOW_STOCK"
    | "OUT_OF_STOCK";

export type InventoryStockRow = {
    productId: string;
    productName: string;
    productActive: boolean;
    categoryName: string | null;
    brandName: string | null;

    variantId: string;
    variantName: string;
    sku: string;
    barcode: string | null;
    sellingPrice: string;

    trackByImei: boolean;
    reorderLevel: number;
    variantActive: boolean;

    quantity: number;
    averageCost: string;
    stockValue: string;
    status: InventoryStockStatus;
};

export type InventoryStockOverview = {
    items: InventoryStockRow[];
    summary: {
        variantCount: number;
        totalUnits: number;
        inventoryCostValue: string;
        lowStockCount: number;
        outOfStockCount: number;
    };
};

export async function getInventoryStockOverview(): Promise<InventoryStockOverview> {
    const shop = await requirePermission("products.view");

    const rows = await db
        .select({
            productId: products.id,
            productName: products.name,
            productActive: products.active,
            categoryName: categories.name,
            brandName: brands.name,

            variantId: productVariants.id,
            variantName: productVariants.name,
            sku: productVariants.sku,
            barcode: productVariants.barcode,
            sellingPrice: productVariants.sellingPrice,
            trackByImei: productVariants.trackByImei,
            reorderLevel: productVariants.reorderLevel,
            variantActive: productVariants.active,

            quantity: inventoryBalances.quantity,
            averageCost: inventoryBalances.averageCost,
        })
        .from(productVariants)
        .innerJoin(
            products,
            and(
                eq(products.id, productVariants.productId),
                eq(products.shopId, productVariants.shopId),
            ),
        )
        .leftJoin(
            categories,
            and(
                eq(categories.id, products.categoryId),
                eq(categories.shopId, products.shopId),
            ),
        )
        .leftJoin(
            brands,
            and(
                eq(brands.id, products.brandId),
                eq(brands.shopId, products.shopId),
            ),
        )
        .leftJoin(
            inventoryBalances,
            and(
                eq(inventoryBalances.variantId, productVariants.id),
                eq(inventoryBalances.shopId, productVariants.shopId),
            ),
        )
        .where(eq(productVariants.shopId, shop.shopId))
        .orderBy(asc(products.name), asc(productVariants.name));

    const items: InventoryStockRow[] = rows.map((row) => {
        // A missing balance is treated as zero for display only.
        // This query never creates or changes inventory records.
        const quantity = row.quantity ?? 0;
        const averageCost = row.averageCost ?? "0.00";
        const reorderLevel = row.reorderLevel;

        let status: InventoryStockStatus = "IN_STOCK";

        if (quantity === 0) {
            status = "OUT_OF_STOCK";
        } else if (quantity <= reorderLevel) {
            status = "LOW_STOCK";
        }

        const stockValue = new Decimal(averageCost)
            .mul(quantity)
            .toFixed(2);

        return {
            productId: row.productId,
            productName: row.productName,
            productActive: row.productActive,
            categoryName: row.categoryName,
            brandName: row.brandName,

            variantId: row.variantId,
            variantName: row.variantName,
            sku: row.sku,
            barcode: row.barcode,
            sellingPrice: row.sellingPrice,

            trackByImei: row.trackByImei,
            reorderLevel,
            variantActive: row.variantActive,

            quantity,
            averageCost,
            stockValue,
            status,
        };
    });

    // Stock alerts should focus on items currently enabled for use.
    const activeItems = items.filter(
        (item) => item.productActive && item.variantActive,
    );

    const inventoryCostValue = items
        .reduce(
            (total, item) => total.plus(item.stockValue),
            new Decimal(0),
        )
        .toFixed(2);

    return {
        items,
        summary: {
            variantCount: items.length,
            totalUnits: items.reduce((total, item) => total + item.quantity, 0),
            inventoryCostValue,
            lowStockCount: activeItems.filter(
                (item) => item.status === "LOW_STOCK",
            ).length,
            outOfStockCount: activeItems.filter(
                (item) => item.status === "OUT_OF_STOCK",
            ).length,
        },
    };
}