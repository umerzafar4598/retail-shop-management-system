import "server-only";

import Decimal from "decimal.js";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
    hasPermission,
    requirePermission,
} from "@/lib/authorization";

export type ProductVariant = {
    id: string;
    productId: string;
    sku: string;
    barcode: string | null;
    name: string;
    sellingPrice: string;
    trackByImei: boolean;
    reorderLevel: number;
    active: boolean;
    quantity: number;
    averageCost: string;
};

export type ProductWithVariants = {
    id: string;
    name: string;
    description: string | null;
    categoryId: string;
    categoryName: string;
    brandId: string | null;
    brandName: string | null;
    active: boolean;
    variants: ProductVariant[];
};

export type ProductFormOptions = {
    categories: Array<{
        id: string;
        name: string;
    }>;
    brands: Array<{
        id: string;
        name: string;
    }>;
};

export type CreateProductInput = {
    name: string;
    description?: string;
    categoryId: string;
    brandId?: string;
    variantName: string;
    sku: string;
    barcode?: string;
    sellingPrice: string | number;
    trackByImei: boolean;
    reorderLevel: string | number;
};

function normalizeText(
    value: string | undefined,
    fieldName: string,
    maxLength: number,
) {
    const normalized = value?.trim() ?? "";

    if (!normalized) {
        throw new Error(
            `${fieldName} is required.`,
        );
    }

    if (normalized.length > maxLength) {
        throw new Error(
            `${fieldName} must not exceed ${maxLength} characters.`,
        );
    }

    return normalized;
}

function normalizeOptionalText(
    value: string | undefined,
    maxLength: number,
) {
    const normalized = value?.trim() ?? "";

    if (!normalized) {
        return null;
    }

    if (normalized.length > maxLength) {
        throw new Error(
            `Value must not exceed ${maxLength} characters.`,
        );
    }

    return normalized;
}

function normalizeSku(value: string) {
    const sku = value.trim().toUpperCase();

    if (!sku) {
        throw new Error("SKU is required.");
    }

    if (sku.length > 100) {
        throw new Error(
            "SKU must not exceed 100 characters.",
        );
    }

    return sku;
}

function normalizePrice(
    value: string | number,
) {
    let price: Decimal;

    try {
        price = new Decimal(value);
    } catch {
        throw new Error(
            "Selling price must be a valid numeric amount.",
        );
    }

    if (!price.isFinite()) {
        throw new Error(
            "Selling price must be a finite numeric amount.",
        );
    }

    if (price.isNegative()) {
        throw new Error(
            "Selling price cannot be negative.",
        );
    }

    if (price.decimalPlaces() > 2) {
        throw new Error(
            "Selling price cannot have more than 2 decimal places.",
        );
    }

    return price;
}

function normalizeReorderLevel(
    value: string | number,
) {
    const numericValue = Number(value);

    if (
        !Number.isInteger(numericValue) ||
        numericValue < 0
    ) {
        throw new Error(
            "Reorder level must be a non-negative whole number.",
        );
    }

    return numericValue;
}

function normalizeCreateProductInput(
    input: CreateProductInput,
) {
    const name = normalizeText(
        input.name,
        "Product name",
        150,
    );

    const description =
        normalizeOptionalText(
            input.description,
            1000,
        );

    if (!input.categoryId?.trim()) {
        throw new Error(
            "Category is required.",
        );
    }

    if (!input.variantName?.trim()) {
        throw new Error(
            "Variant name is required.",
        );
    }

    const variantName = normalizeText(
        input.variantName,
        "Variant name",
        150,
    );

    const sku = normalizeSku(input.sku);

    const barcode = normalizeOptionalText(
        input.barcode,
        100,
    );

    const sellingPrice =
        normalizePrice(input.sellingPrice);

    const reorderLevel =
        normalizeReorderLevel(
            input.reorderLevel,
        );

    return {
        name,
        description,
        categoryId:
            input.categoryId.trim(),
        brandId:
            input.brandId?.trim() || null,
        variantName,
        sku,
        barcode,
        sellingPrice,
        trackByImei:
            Boolean(input.trackByImei),
        reorderLevel,
    };
}

export async function getProductFormOptions(): Promise<
    ProductFormOptions
> {
    const context = await requirePermission(
        "products.view",
    );

    const [categoriesResult, brandsResult] =
        await Promise.all([
            db.execute<{
                id: string;
                name: string;
            }>(sql`
        SELECT id, name
        FROM categories
        WHERE shop_id = ${context.shopId}
          AND active = true
        ORDER BY name ASC
      `),

            db.execute<{
                id: string;
                name: string;
            }>(sql`
        SELECT id, name
        FROM brands
        WHERE shop_id = ${context.shopId}
          AND active = true
        ORDER BY name ASC
      `),
        ]);

    return {
        categories:
            categoriesResult.rows,
        brands: brandsResult.rows,
    };
}

export async function listProducts(): Promise<
    ProductWithVariants[]
> {
    const context = await requirePermission(
        "products.view",
    );

    const productsResult =
        await db.execute<{
            id: string;
            name: string;
            description: string | null;
            categoryId: string;
            categoryName: string;
            brandId: string | null;
            brandName: string | null;
            active: boolean;
        }>(sql`
      SELECT
        p.id,
        p.name,
        p.description,
        p.category_id AS "categoryId",
        c.name AS "categoryName",
        p.brand_id AS "brandId",
        b.name AS "brandName",
        p.active

      FROM products p

      INNER JOIN categories c
        ON c.id = p.category_id
        AND c.shop_id = p.shop_id

      LEFT JOIN brands b
        ON b.id = p.brand_id
        AND b.shop_id = p.shop_id

      WHERE p.shop_id = ${context.shopId}

      ORDER BY
        p.active DESC,
        p.name ASC
    `);

    if (productsResult.rows.length === 0) {
        return [];
    }

    const productIds =
        productsResult.rows.map(
            (product) => product.id,
        );

    const variantsResult =
        await db.execute<{
            id: string;
            productId: string;
            sku: string;
            barcode: string | null;
            name: string;
            sellingPrice: string;
            trackByImei: boolean;
            reorderLevel: number;
            active: boolean;
            quantity: number;
            averageCost: string;
        }>(sql`
      SELECT
        pv.id,
        pv.product_id AS "productId",
        pv.sku,
        pv.barcode,
        pv.name,
        pv.selling_price::text AS "sellingPrice",
        pv.track_by_imei AS "trackByImei",
        pv.reorder_level AS "reorderLevel",
        pv.active,
        COALESCE(ib.quantity, 0) AS quantity,
        COALESCE(
          ib.average_cost,
          0
        )::text AS "averageCost"

      FROM product_variants pv

      LEFT JOIN inventory_balances ib
        ON ib.variant_id = pv.id
        AND ib.shop_id = pv.shop_id

      WHERE pv.shop_id = ${context.shopId}
        AND pv.product_id IN (
          ${sql.join(
            productIds.map(
                (id) => sql`${id}`,
            ),
            sql`, `,
        )}
        )

      ORDER BY
        pv.active DESC,
        pv.name ASC
    `);

    const variantsByProduct =
        new Map<
            string,
            ProductVariant[]
        >();

    for (const variant of variantsResult.rows) {
        const existing =
            variantsByProduct.get(
                variant.productId,
            ) ?? [];

        existing.push(variant);

        variantsByProduct.set(
            variant.productId,
            existing,
        );
    }

    return productsResult.rows.map(
        (product) => ({
            ...product,
            variants:
                variantsByProduct.get(
                    product.id,
                ) ?? [],
        }),
    );
}

export async function createProduct(
    input: CreateProductInput,
) {
    const context = await requirePermission(
        "products.create",
    );

    const data =
        normalizeCreateProductInput(input);

    return db.transaction(async (tx) => {
        const categoryResult =
            await tx.execute<{
                id: string;
                name: string;
            }>(sql`
        SELECT id, name
        FROM categories
        WHERE id = ${data.categoryId}
          AND shop_id = ${context.shopId}
          AND active = true
        LIMIT 1
      `);

        const category =
            categoryResult.rows[0];

        if (!category) {
            throw new Error(
                "The selected category is invalid or inactive.",
            );
        }

        if (data.brandId) {
            const brandResult =
                await tx.execute<{
                    id: string;
                    name: string;
                }>(sql`
          SELECT id, name
          FROM brands
          WHERE id = ${data.brandId}
            AND shop_id = ${context.shopId}
            AND active = true
          LIMIT 1
        `);

            if (!brandResult.rows[0]) {
                throw new Error(
                    "The selected brand is invalid or inactive.",
                );
            }
        }

        const duplicateProduct =
            await tx.execute<{ id: string }>(sql`
        SELECT id
        FROM products
        WHERE shop_id = ${context.shopId}
          AND lower(name) = lower(${data.name})
        LIMIT 1
      `);

        if (duplicateProduct.rows[0]) {
            throw new Error(
                "A product with this name already exists.",
            );
        }

        const duplicateSku =
            await tx.execute<{ id: string }>(sql`
        SELECT id
        FROM product_variants
        WHERE shop_id = ${context.shopId}
          AND sku = ${data.sku}
        LIMIT 1
      `);

        if (duplicateSku.rows[0]) {
            throw new Error(
                "A variant with this SKU already exists.",
            );
        }

        if (data.barcode) {
            const duplicateBarcode =
                await tx.execute<{ id: string }>(sql`
          SELECT id
          FROM product_variants
          WHERE shop_id = ${context.shopId}
            AND barcode = ${data.barcode}
          LIMIT 1
        `);

            if (duplicateBarcode.rows[0]) {
                throw new Error(
                    "A variant with this barcode already exists.",
                );
            }
        }

        const productResult =
            await tx.execute<{ id: string }>(sql`
        INSERT INTO products (
          shop_id,
          category_id,
          brand_id,
          name,
          description,
          active
        )
        VALUES (
          ${context.shopId},
          ${data.categoryId},
          ${data.brandId},
          ${data.name},
          ${data.description},
          true
        )
        RETURNING id
      `);

        const product =
            productResult.rows[0];

        if (!product) {
            throw new Error(
                "Failed to create the product.",
            );
        }

        const variantResult =
            await tx.execute<{ id: string }>(sql`
        INSERT INTO product_variants (
          shop_id,
          product_id,
          sku,
          barcode,
          name,
          selling_price,
          track_by_imei,
          reorder_level,
          active
        )
        VALUES (
          ${context.shopId},
          ${product.id},
          ${data.sku},
          ${data.barcode},
          ${data.variantName},
          ${data.sellingPrice.toFixed(2)}::numeric,
          ${data.trackByImei},
          ${data.reorderLevel},
          true
        )
        RETURNING id
      `);

        const variant =
            variantResult.rows[0];

        if (!variant) {
            throw new Error(
                "Failed to create the product variant.",
            );
        }

        await tx.execute(sql`
      INSERT INTO inventory_balances (
        shop_id,
        variant_id,
        quantity,
        average_cost
      )
      VALUES (
        ${context.shopId},
        ${variant.id},
        0,
        0
      )
    `);

        return {
            productId: product.id,
            variantId: variant.id,
        };
    });
}

export async function setProductStatus(
    productId: string,
    active: boolean,
) {
    const context = await requirePermission(
        "products.update",
    );

    if (!productId?.trim()) {
        throw new Error(
            "Product ID is required.",
        );
    }

    await db.transaction(async (tx) => {
        const result =
            await tx.execute<{ id: string }>(sql`
        SELECT id
        FROM products
        WHERE id = ${productId}
          AND shop_id = ${context.shopId}
        LIMIT 1
        FOR UPDATE
      `);

        const product =
            result.rows[0];

        if (!product) {
            throw new Error(
                "Product was not found.",
            );
        }

        await tx.execute(sql`
      UPDATE products
      SET
        active = ${active},
        updated_at = now()
      WHERE id = ${product.id}
        AND shop_id = ${context.shopId}
    `);

        /**
         * When a product is deactivated, its variants
         * must also stop being sellable.
         *
         * Reactivating the product does not automatically
         * reactivate previously disabled variants.
         */
        if (!active) {
            await tx.execute(sql`
        UPDATE product_variants
        SET
          active = false,
          updated_at = now()
        WHERE product_id = ${product.id}
          AND shop_id = ${context.shopId}
      `);
        }
    });
}

export async function canCreateProducts() {
    const context = await requirePermission(
        "products.view",
    );

    const sessionResult =
        await db.execute<{ userId: string }>(sql`
      SELECT sm.user_id AS "userId"
      FROM shop_memberships sm
      WHERE sm.shop_id = ${context.shopId}
        AND sm.status = 'ACTIVE'
        AND sm.user_id IS NOT NULL
      LIMIT 1
    `);

    const userId =
        sessionResult.rows[0]?.userId;

    if (!userId) {
        return false;
    }

    return hasPermission(
        userId,
        context.shopId,
        "products.create",
    );
}