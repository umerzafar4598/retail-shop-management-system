import "dotenv/config";

import { eq } from "drizzle-orm";

import { db, pool } from "./client";
import {
  brands,
  categories,
  documentSequences,
  expenseCategories,
  financialAccounts,
  inventoryBalances,
  ledgerAccounts,
  permissions,
  productVariants,
  products,
  rolePermissions,
  roles,
  serviceTypes,
  shopSettings,
  shops,
} from "./schema";

const permissionKeys = [
  "sales.view",
  "sales.create",
  "sales.void",
  "sales.return",
  "inventory.view",
  "inventory.create",
  "inventory.adjust",
  "purchases.view",
  "purchases.create",
  "services.view",
  "services.create",
  "services.complete",
  "services.cancel",
  "accounts.view",
  "accounts.create",
  "accounts.update",
  "accounts.transfer",
  "expenses.view",
  "expenses.create",
  "expenses.cancel",
  "reports.view",
  "staff.view",
  "staff.manage",
  "settings.manage",
  "audit.view",
] as const;

const allPermissions = [...permissionKeys];

const rolePermissionMap: Record<string, readonly string[]> = {
  OWNER: allPermissions,
  MANAGER: allPermissions.filter((key) => !["staff.manage", "settings.manage"].includes(key)),
  CASHIER: [
    "sales.view",
    "sales.create",
    "sales.return",
    "inventory.view",
    "services.view",
    "services.create",
    "services.complete",
    "services.cancel",
    "accounts.view",
    "reports.view",
  ],
  STAFF: [
    "inventory.view",
    "services.view",
    "services.create",
  ],
};

async function seed() {
  const existingShop = await db
    .select({ id: shops.id })
    .from(shops)
    .where(eq(shops.slug, "main-mobile-shop"))
    .limit(1);

  if (existingShop.length > 0) {
    console.log("Seed skipped: main-mobile-shop already exists.");
    return;
  }

  await db.transaction(async (tx) => {
    const [shop] = await tx
      .insert(shops)
      .values({
        name: "Main Mobile Shop",
        slug: "main-mobile-shop",
        currency: "PKR",
        timezone: "Asia/Karachi",
      })
      .returning({ id: shops.id });

    await tx.insert(shopSettings).values({
      shopId: shop.id,
      receiptHeader: "Main Mobile Shop",
      receiptFooter: "Thank you for your business.",
    });

    const permissionRows = await tx
      .insert(permissions)
      .values(permissionKeys.map((key) => ({ key })))
      .returning({ id: permissions.id, key: permissions.key });

    const permissionByKey = new Map(permissionRows.map((row) => [row.key, row.id]));

    const roleRows = await tx
      .insert(roles)
      .values(
        ["OWNER", "MANAGER", "CASHIER", "STAFF"].map((name) => ({
          shopId: shop.id,
          name,
          isSystem: true,
        })),
      )
      .returning({ id: roles.id, name: roles.name });

    for (const role of roleRows) {
      const permissionIds = rolePermissionMap[role.name] ?? [];
      await tx.insert(rolePermissions).values(
        permissionIds.map((key) => ({
          roleId: role.id,
          permissionId: permissionByKey.get(key)!,
        })),
      );
    }

    const [categoryMobile, categoryAccessories, categoryCharging, categoryAudio] =
      await tx
        .insert(categories)
        .values([
          { shopId: shop.id, name: "Mobile Phones" },
          { shopId: shop.id, name: "Accessories" },
          { shopId: shop.id, name: "Charging" },
          { shopId: shop.id, name: "Audio" },
        ])
        .returning({ id: categories.id, name: categories.name });

    const [samsung, generic, anker] = await tx
      .insert(brands)
      .values([
        { shopId: shop.id, name: "Samsung" },
        { shopId: shop.id, name: "Generic" },
        { shopId: shop.id, name: "Anker" },
      ])
      .returning({ id: brands.id, name: brands.name });

    const categoryByName = new Map(
      [categoryMobile, categoryAccessories, categoryCharging, categoryAudio].map((row) => [
        row.name,
        row.id,
      ]),
    );
    const brandByName = new Map(
      [samsung, generic, anker].map((row) => [row.name, row.id]),
    );

    const [phoneProduct, handsfreeProduct, cableProduct, chargerProduct] = await tx
      .insert(products)
      .values([
        {
          shopId: shop.id,
          categoryId: categoryByName.get("Mobile Phones")!,
          brandId: brandByName.get("Samsung")!,
          name: "Samsung Galaxy A15",
        },
        {
          shopId: shop.id,
          categoryId: categoryByName.get("Audio")!,
          brandId: brandByName.get("Generic")!,
          name: "Generic Handsfree",
        },
        {
          shopId: shop.id,
          categoryId: categoryByName.get("Charging")!,
          brandId: brandByName.get("Generic")!,
          name: "USB-C Cable",
        },
        {
          shopId: shop.id,
          categoryId: categoryByName.get("Charging")!,
          brandId: brandByName.get("Anker")!,
          name: "Anker Charger",
        },
      ])
      .returning({ id: products.id, name: products.name });

    const productsByName = new Map(
      [phoneProduct, handsfreeProduct, cableProduct, chargerProduct].map((row) => [
        row.name,
        row.id,
      ]),
    );

    const variants = await tx
      .insert(productVariants)
      .values([
        {
          shopId: shop.id,
          productId: productsByName.get("Samsung Galaxy A15")!,
          sku: "SAM-A15-8256-BLK",
          name: "8GB / 256GB / Black",
          sellingPrice: "45000.00",
          trackByImei: true,
          reorderLevel: 1,
        },
        {
          shopId: shop.id,
          productId: productsByName.get("Generic Handsfree")!,
          sku: "GEN-HF-001",
          name: "Standard",
          sellingPrice: "700.00",
          trackByImei: false,
          reorderLevel: 5,
        },
        {
          shopId: shop.id,
          productId: productsByName.get("USB-C Cable")!,
          sku: "GEN-CBL-USBC-1M",
          name: "1 Meter",
          sellingPrice: "400.00",
          trackByImei: false,
          reorderLevel: 10,
        },
        {
          shopId: shop.id,
          productId: productsByName.get("Anker Charger")!,
          sku: "ANK-20W-001",
          name: "20W USB-C",
          sellingPrice: "2500.00",
          trackByImei: false,
          reorderLevel: 3,
        },
      ])
      .returning({ id: productVariants.id });

    await tx.insert(inventoryBalances).values(
      variants.map((variant) => ({
        shopId: shop.id,
        variantId: variant.id,
        quantity: 0,
        averageCost: "0.00",
      })),
    );

    const ledgerSeed = [
      ["1000", "Cash Drawer", "ASSET", "DEBIT", "CASH_DRAWER"],
      ["1001", "Easypaisa 676", "ASSET", "DEBIT", "EASYPAISA_676"],
      ["1002", "Easypaisa 181", "ASSET", "DEBIT", "EASYPAISA_181"],
      ["1003", "JazzCash 733", "ASSET", "DEBIT", "JAZZCASH_733"],
      ["1004", "JazzCash 911", "ASSET", "DEBIT", "JAZZCASH_911"],
      ["1005", "HBL ****1234", "ASSET", "DEBIT", "HBL_1234"],
      ["1006", "Meezan ****5678", "ASSET", "DEBIT", "MEEZAN_5678"],
      ["1200", "Inventory", "ASSET", "DEBIT", "INVENTORY"],
      ["2000", "Accounts Payable", "LIABILITY", "CREDIT", "ACCOUNTS_PAYABLE"],
      ["3000", "Owner Capital", "EQUITY", "CREDIT", "OWNER_CAPITAL"],
      ["3100", "Owner Drawings", "EQUITY", "DEBIT", "OWNER_DRAWINGS"],
      ["3900", "Opening Balance Equity", "EQUITY", "CREDIT", "OPENING_BALANCE_EQUITY"],
      ["4000", "Product Sales", "REVENUE", "CREDIT", "PRODUCT_SALES"],
      ["4100", "Service Revenue", "REVENUE", "CREDIT", "SERVICE_REVENUE"],
      ["4900", "Sales Returns", "REVENUE", "DEBIT", "SALES_RETURNS"],
      ["5000", "Cost of Goods Sold", "EXPENSE", "DEBIT", "COGS"],
      ["6000", "Electricity", "EXPENSE", "DEBIT", "EXPENSE_ELECTRICITY"],
      ["6010", "Internet", "EXPENSE", "DEBIT", "EXPENSE_INTERNET"],
      ["6020", "Rent", "EXPENSE", "DEBIT", "EXPENSE_RENT"],
      ["6030", "Salary", "EXPENSE", "DEBIT", "EXPENSE_SALARY"],
      ["6040", "Maintenance", "EXPENSE", "DEBIT", "EXPENSE_MAINTENANCE"],
      ["6050", "Miscellaneous", "EXPENSE", "DEBIT", "EXPENSE_MISC"],
    ] as const;

    const ledgerRows = await tx
      .insert(ledgerAccounts)
      .values(
        ledgerSeed.map(([code, name, accountType, normalBalance, systemKey]) => ({
          shopId: shop.id,
          code,
          name,
          accountType: accountType as
            | "ASSET"
            | "LIABILITY"
            | "EQUITY"
            | "REVENUE"
            | "EXPENSE",
          normalBalance: normalBalance as "DEBIT" | "CREDIT",
          systemKey,
          isSystem: true,
        })),
      )
      .returning({ id: ledgerAccounts.id, systemKey: ledgerAccounts.systemKey });

    const ledgerByKey = new Map(ledgerRows.map((row) => [row.systemKey!, row.id]));

    await tx.insert(financialAccounts).values([
      {
        shopId: shop.id,
        ledgerAccountId: ledgerByKey.get("CASH_DRAWER")!,
        name: "Main Cash Drawer",
        kind: "CASH",
        provider: "INTERNAL",
      },
      {
        shopId: shop.id,
        ledgerAccountId: ledgerByKey.get("EASYPAISA_676")!,
        name: "Easypaisa 676",
        kind: "DIGITAL_WALLET",
        provider: "EASYPAISA",
        identifier: "DEMO-676",
      },
      {
        shopId: shop.id,
        ledgerAccountId: ledgerByKey.get("EASYPAISA_181")!,
        name: "Easypaisa 181",
        kind: "DIGITAL_WALLET",
        provider: "EASYPAISA",
        identifier: "DEMO-181",
      },
      {
        shopId: shop.id,
        ledgerAccountId: ledgerByKey.get("JAZZCASH_733")!,
        name: "JazzCash 733",
        kind: "DIGITAL_WALLET",
        provider: "JAZZCASH",
        identifier: "DEMO-733",
      },
      {
        shopId: shop.id,
        ledgerAccountId: ledgerByKey.get("JAZZCASH_911")!,
        name: "JazzCash 911",
        kind: "DIGITAL_WALLET",
        provider: "JAZZCASH",
        identifier: "DEMO-911",
      },
      {
        shopId: shop.id,
        ledgerAccountId: ledgerByKey.get("HBL_1234")!,
        name: "HBL ****1234",
        kind: "BANK",
        provider: "HBL",
        identifier: "DEMO-1234",
      },
      {
        shopId: shop.id,
        ledgerAccountId: ledgerByKey.get("MEEZAN_5678")!,
        name: "Meezan ****5678",
        kind: "BANK",
        provider: "MEEZAN",
        identifier: "DEMO-5678",
      },
    ]);

    const services = [
      ["EASYPAISA_DEPOSIT", "Easypaisa Deposit", "FINANCIAL", "50.00", "OUT"],
      ["EASYPAISA_WITHDRAWAL", "Easypaisa Withdrawal", "FINANCIAL", "50.00", "IN"],
      ["JAZZCASH_DEPOSIT", "JazzCash Deposit", "FINANCIAL", "50.00", "OUT"],
      ["JAZZCASH_WITHDRAWAL", "JazzCash Withdrawal", "FINANCIAL", "50.00", "IN"],
      ["BANK_DEPOSIT", "Bank Deposit", "FINANCIAL", "50.00", "OUT"],
      ["BANK_WITHDRAWAL", "Bank Withdrawal", "FINANCIAL", "50.00", "IN"],
      ["BILL_PAYMENT", "Bill Payment", "BILL_PAYMENT", "30.00", "NONE"],
      ["CNIC_BIOMETRIC", "CNIC Biometric", "GOVERNMENT", "100.00", "NONE"],
      ["VEHICLE_VERIFICATION", "Vehicle Verification", "GOVERNMENT", "200.00", "NONE"],
      ["VEHICLE_TRANSFER", "Vehicle Transfer", "GOVERNMENT", "500.00", "NONE"],
    ] as const;

    await tx.insert(serviceTypes).values(
      services.map(([code, name, category, defaultFee, direction]) => ({
        shopId: shop.id,
        code,
        name,
        category,
        defaultFee,
        providerMoneyDirection: direction as "IN" | "OUT" | "NONE",
      })),
    );

    const expenseLedgerMap = {
      Electricity: ledgerByKey.get("EXPENSE_ELECTRICITY")!,
      Internet: ledgerByKey.get("EXPENSE_INTERNET")!,
      Rent: ledgerByKey.get("EXPENSE_RENT")!,
      Salary: ledgerByKey.get("EXPENSE_SALARY")!,
      Maintenance: ledgerByKey.get("EXPENSE_MAINTENANCE")!,
      Miscellaneous: ledgerByKey.get("EXPENSE_MISC")!,
    };

    await tx.insert(expenseCategories).values(
      Object.entries(expenseLedgerMap).map(([name, ledgerAccountId]) => ({
        shopId: shop.id,
        ledgerAccountId,
        name,
      })),
    );

    await tx.insert(documentSequences).values(
      ["SAL", "PUR", "SRV", "RET", "EXP", "TRF"].map((documentType) => ({
        shopId: shop.id,
        documentType,
        year: new Date().getUTCFullYear(),
        lastValue: 0,
      })),
    );
  });

  console.log("Phase 3 demo seed completed.");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
