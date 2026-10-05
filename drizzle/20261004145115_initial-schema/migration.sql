CREATE TYPE "cash_session_status" AS ENUM('OPEN', 'CLOSED', 'RECONCILIATION_REQUIRED');--> statement-breakpoint
CREATE TYPE "expense_status" AS ENUM('POSTED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "financial_account_kind" AS ENUM('CASH', 'DIGITAL_WALLET', 'BANK', 'OTHER');--> statement-breakpoint
CREATE TYPE "imei_device_status" AS ENUM('IN_STOCK', 'SOLD', 'RETURNED', 'DAMAGED', 'RESERVED');--> statement-breakpoint
CREATE TYPE "inventory_movement_type" AS ENUM('OPENING', 'PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'DAMAGE', 'OTHER');--> statement-breakpoint
CREATE TYPE "ledger_account_type" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "membership_status" AS ENUM('ACTIVE', 'INVITED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "normal_balance" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "payment_status" AS ENUM('UNPAID', 'RECEIVED', 'REFUNDED', 'PARTIALLY_REFUNDED');--> statement-breakpoint
CREATE TYPE "provider_money_direction" AS ENUM('IN', 'OUT', 'NONE');--> statement-breakpoint
CREATE TYPE "purchase_status" AS ENUM('DRAFT', 'POSTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "return_condition" AS ENUM('RESTOCK', 'DAMAGED', 'OTHER');--> statement-breakpoint
CREATE TYPE "return_status" AS ENUM('COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "sale_status" AS ENUM('COMPLETED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "service_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED');--> statement-breakpoint
CREATE TABLE "shop_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL UNIQUE,
	"phone" text,
	"address" text,
	"receipt_header" text,
	"receipt_footer" text,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"timezone" text DEFAULT 'Asia/Karachi' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"key" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid,
	"permission_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pkey" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE'::"membership_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"selling_price" numeric(14,2) NOT NULL,
	"track_by_imei" boolean DEFAULT false NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_price_non_negative" CHECK ("selling_price" >= 0),
	CONSTRAINT "product_variants_reorder_non_negative" CHECK ("reorder_level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"brand_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"account_type" "ledger_account_type" NOT NULL,
	"normal_balance" "normal_balance" NOT NULL,
	"system_key" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"ledger_transaction_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"cash_session_id" uuid,
	"debit" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"credit" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_debit_non_negative" CHECK ("debit" >= 0),
	CONSTRAINT "ledger_entries_credit_non_negative" CHECK ("credit" >= 0),
	CONSTRAINT "ledger_entries_exactly_one_side" CHECK (("debit" > 0 AND "credit" = 0) OR ("debit" = 0 AND "credit" > 0))
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" uuid,
	"description" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"reversal_of_id" uuid
);
--> statement-breakpoint
CREATE TABLE "account_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"document_no" text NOT NULL,
	"source_account_id" uuid NOT NULL,
	"destination_account_id" uuid NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	"reason" text,
	"created_by" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_transfers_amount_positive" CHECK ("amount" > 0),
	CONSTRAINT "account_transfers_distinct_accounts" CHECK ("source_account_id" <> "destination_account_id")
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL UNIQUE,
	"name" text NOT NULL,
	"kind" "financial_account_kind" NOT NULL,
	"provider" text DEFAULT 'INTERNAL' NOT NULL,
	"identifier" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_accounts_provider_not_empty" CHECK (length(trim("provider")) > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(14,2) NOT NULL,
	"discount_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"line_total" numeric(14,2) NOT NULL,
	CONSTRAINT "purchase_items_quantity_positive" CHECK ("quantity" > 0),
	CONSTRAINT "purchase_items_unit_cost_non_negative" CHECK ("unit_cost" >= 0),
	CONSTRAINT "purchase_items_discount_non_negative" CHECK ("discount_amount" >= 0),
	CONSTRAINT "purchase_items_line_total_non_negative" CHECK ("line_total" >= 0),
	CONSTRAINT "purchase_items_line_total_formula" CHECK ("line_total" = ("quantity" * "unit_cost") - "discount_amount")
);
--> statement-breakpoint
CREATE TABLE "purchase_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "purchase_payments_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"document_no" text NOT NULL,
	"supplier_id" uuid,
	"status" "purchase_status" DEFAULT 'DRAFT'::"purchase_status" NOT NULL,
	"purchase_date" date NOT NULL,
	"subtotal" numeric(14,2) NOT NULL,
	"discount_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"total_amount" numeric(14,2) NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_subtotal_non_negative" CHECK ("subtotal" >= 0),
	CONSTRAINT "purchases_discount_non_negative" CHECK ("discount_amount" >= 0),
	CONSTRAINT "purchases_total_non_negative" CHECK ("total_amount" >= 0),
	CONSTRAINT "purchases_total_formula" CHECK ("total_amount" = "subtotal" - "discount_amount")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"address" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imei_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"imei_1" text NOT NULL,
	"imei_2" text,
	"serial_number" text,
	"purchase_item_id" uuid,
	"purchase_cost" numeric(14,2) NOT NULL,
	"status" "imei_device_status" DEFAULT 'IN_STOCK'::"imei_device_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imei_devices_purchase_cost_non_negative" CHECK ("purchase_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"average_cost" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_balances_quantity_non_negative" CHECK ("quantity" >= 0),
	CONSTRAINT "inventory_balances_average_cost_non_negative" CHECK ("average_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"imei_device_id" uuid,
	"quantity_delta" integer NOT NULL,
	"movement_type" "inventory_movement_type" NOT NULL,
	"unit_cost" numeric(14,2),
	"reference_type" text,
	"reference_id" uuid,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_quantity_non_zero" CHECK ("quantity_delta" <> 0),
	CONSTRAINT "inventory_movements_unit_cost_non_negative" CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"imei_device_id" uuid,
	"description_snapshot" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(14,2) NOT NULL,
	"discount_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"line_total" numeric(14,2) NOT NULL,
	"cost_snapshot" numeric(14,2) NOT NULL,
	CONSTRAINT "sale_items_quantity_positive" CHECK ("quantity" > 0),
	CONSTRAINT "sale_items_unit_price_non_negative" CHECK ("unit_price" >= 0),
	CONSTRAINT "sale_items_discount_non_negative" CHECK ("discount_amount" >= 0),
	CONSTRAINT "sale_items_line_total_non_negative" CHECK ("line_total" >= 0),
	CONSTRAINT "sale_items_cost_non_negative" CHECK ("cost_snapshot" >= 0),
	CONSTRAINT "sale_items_line_total_formula" CHECK ("line_total" = ("quantity" * "unit_price") - "discount_amount"),
	CONSTRAINT "sale_items_imei_quantity_rule" CHECK ("imei_device_id" IS NULL OR "quantity" = 1)
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "sale_payments_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"document_no" text NOT NULL,
	"customer_id" uuid,
	"status" "sale_status" DEFAULT 'COMPLETED'::"sale_status" NOT NULL,
	"subtotal" numeric(14,2) NOT NULL,
	"discount_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"total_amount" numeric(14,2) NOT NULL,
	"created_by" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_subtotal_non_negative" CHECK ("subtotal" >= 0),
	CONSTRAINT "sales_discount_non_negative" CHECK ("discount_amount" >= 0),
	CONSTRAINT "sales_total_non_negative" CHECK ("total_amount" >= 0),
	CONSTRAINT "sales_total_formula" CHECK ("total_amount" = "subtotal" - "discount_amount")
);
--> statement-breakpoint
CREATE TABLE "return_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"return_id" uuid NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	"refunded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "return_refunds_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"return_id" uuid NOT NULL,
	"sale_item_id" uuid NOT NULL,
	"imei_device_id" uuid,
	"quantity" integer NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	"condition" "return_condition" DEFAULT 'RESTOCK'::"return_condition" NOT NULL,
	CONSTRAINT "sale_return_items_quantity_positive" CHECK ("quantity" > 0),
	CONSTRAINT "sale_return_items_amount_non_negative" CHECK ("amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"document_no" text NOT NULL,
	"original_sale_id" uuid NOT NULL,
	"replacement_sale_id" uuid,
	"status" "return_status" DEFAULT 'COMPLETED'::"return_status" NOT NULL,
	"reason" text,
	"refund_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"created_by" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_returns_refund_non_negative" CHECK ("refund_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"service_transaction_id" uuid NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "service_payments_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "service_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"document_no" text NOT NULL,
	"service_type_id" uuid NOT NULL,
	"customer_id" uuid,
	"principal_amount" numeric(14,2) NOT NULL,
	"service_fee" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"total_amount" numeric(14,2) NOT NULL,
	"provider_account_id" uuid,
	"payment_status" "payment_status" DEFAULT 'UNPAID'::"payment_status" NOT NULL,
	"service_status" "service_status" DEFAULT 'PENDING'::"service_status" NOT NULL,
	"external_reference" text,
	"notes" text,
	"created_by" text NOT NULL,
	"completed_by" text,
	"completed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_transactions_principal_non_negative" CHECK ("principal_amount" >= 0),
	CONSTRAINT "service_transactions_fee_non_negative" CHECK ("service_fee" >= 0),
	CONSTRAINT "service_transactions_total_non_negative" CHECK ("total_amount" >= 0),
	CONSTRAINT "service_transactions_total_formula" CHECK ("total_amount" = "principal_amount" + "service_fee")
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'OTHER' NOT NULL,
	"default_fee" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"provider_money_direction" "provider_money_direction" DEFAULT 'NONE'::"provider_money_direction" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_types_default_fee_non_negative" CHECK ("default_fee" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"opening_amount" numeric(14,2) NOT NULL,
	"opening_ledger_balance" numeric(14,2) NOT NULL,
	"expected_closing_amount" numeric(14,2),
	"actual_closing_amount" numeric(14,2),
	"difference" numeric(14,2),
	"status" "cash_session_status" DEFAULT 'OPEN'::"cash_session_status" NOT NULL,
	"opened_by" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	CONSTRAINT "cash_sessions_opening_non_negative" CHECK ("opening_amount" >= 0),
	CONSTRAINT "cash_sessions_opening_ledger_non_negative" CHECK ("opening_ledger_balance" >= 0),
	CONSTRAINT "cash_sessions_expected_non_negative" CHECK ("expected_closing_amount" IS NULL OR "expected_closing_amount" >= 0),
	CONSTRAINT "cash_sessions_actual_non_negative" CHECK ("actual_closing_amount" IS NULL OR "actual_closing_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"document_no" text NOT NULL,
	"category_id" uuid NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	"expense_date" date NOT NULL,
	"payee" text,
	"notes" text,
	"status" "expense_status" DEFAULT 'POSTED'::"expense_status" NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_sequences_year_valid" CHECK ("year" >= 2000),
	CONSTRAINT "document_sequences_last_value_non_negative" CHECK ("last_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_unique" ON "permissions" ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_shop_name_unique" ON "roles" ("shop_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_shop_id_unique" ON "roles" ("shop_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_memberships_shop_user_unique" ON "shop_memberships" ("shop_id","user_id");--> statement-breakpoint
CREATE INDEX "shop_memberships_role_idx" ON "shop_memberships" ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_shop_name_unique" ON "brands" ("shop_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_shop_id_unique" ON "brands" ("shop_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_shop_name_unique" ON "categories" ("shop_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_shop_id_unique" ON "categories" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_shop_sku_unique" ON "product_variants" ("shop_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_shop_barcode_unique" ON "product_variants" ("shop_id","barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_shop_id_unique" ON "product_variants" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "product_variants_shop_idx" ON "product_variants" ("shop_id");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_shop_name_unique" ON "products" ("shop_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "products_shop_id_unique" ON "products" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" ("category_id");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_shop_code_unique" ON "ledger_accounts" ("shop_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_shop_name_unique" ON "ledger_accounts" ("shop_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_shop_system_key_unique" ON "ledger_accounts" ("shop_id","system_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_shop_id_unique" ON "ledger_accounts" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "ledger_accounts_parent_idx" ON "ledger_accounts" ("parent_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_shop_transaction_idx" ON "ledger_entries" ("shop_id","ledger_transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_shop_account_idx" ON "ledger_entries" ("shop_id","ledger_account_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_cash_session_idx" ON "ledger_entries" ("cash_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_shop_id_unique" ON "ledger_transactions" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_shop_occurred_idx" ON "ledger_transactions" ("shop_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_transactions_reference_idx" ON "ledger_transactions" ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_reversal_idx" ON "ledger_transactions" ("reversal_of_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_transfers_shop_document_unique" ON "account_transfers" ("shop_id","document_no");--> statement-breakpoint
CREATE INDEX "account_transfers_source_idx" ON "account_transfers" ("source_account_id");--> statement-breakpoint
CREATE INDEX "account_transfers_destination_idx" ON "account_transfers" ("destination_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_shop_name_unique" ON "financial_accounts" ("shop_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_shop_id_unique" ON "financial_accounts" ("shop_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_provider_identifier_unique" ON "financial_accounts" ("shop_id","provider","identifier") WHERE "identifier" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "financial_accounts_shop_kind_idx" ON "financial_accounts" ("shop_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_items_shop_id_unique" ON "purchase_items" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_idx" ON "purchase_items" ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_items_variant_idx" ON "purchase_items" ("variant_id");--> statement-breakpoint
CREATE INDEX "purchase_payments_purchase_idx" ON "purchase_payments" ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_payments_account_idx" ON "purchase_payments" ("financial_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_shop_document_unique" ON "purchases" ("shop_id","document_no");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_shop_id_unique" ON "purchases" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "purchases_supplier_idx" ON "purchases" ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchases_shop_date_idx" ON "purchases" ("shop_id","purchase_date");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_shop_name_unique" ON "suppliers" ("shop_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_shop_id_unique" ON "suppliers" ("shop_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "imei_devices_shop_imei1_unique" ON "imei_devices" ("shop_id","imei_1");--> statement-breakpoint
CREATE UNIQUE INDEX "imei_devices_shop_imei2_unique" ON "imei_devices" ("shop_id","imei_2");--> statement-breakpoint
CREATE UNIQUE INDEX "imei_devices_shop_id_unique" ON "imei_devices" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "imei_devices_variant_idx" ON "imei_devices" ("variant_id");--> statement-breakpoint
CREATE INDEX "imei_devices_purchase_item_idx" ON "imei_devices" ("purchase_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_balances_shop_variant_unique" ON "inventory_balances" ("shop_id","variant_id");--> statement-breakpoint
CREATE INDEX "inventory_balances_shop_variant_idx" ON "inventory_balances" ("shop_id","variant_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_shop_variant_idx" ON "inventory_movements" ("shop_id","variant_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_imei_idx" ON "inventory_movements" ("imei_device_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_reference_idx" ON "inventory_movements" ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_created_idx" ON "inventory_movements" ("shop_id","created_at");--> statement-breakpoint
CREATE INDEX "customers_shop_name_idx" ON "customers" ("shop_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_shop_id_unique" ON "customers" ("shop_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_items_shop_id_unique" ON "sale_items" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "sale_items_sale_idx" ON "sale_items" ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_variant_idx" ON "sale_items" ("variant_id");--> statement-breakpoint
CREATE INDEX "sale_items_imei_idx" ON "sale_items" ("imei_device_id");--> statement-breakpoint
CREATE INDEX "sale_payments_sale_idx" ON "sale_payments" ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_payments_account_idx" ON "sale_payments" ("financial_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_shop_document_unique" ON "sales" ("shop_id","document_no");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_shop_id_unique" ON "sales" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "sales_shop_created_idx" ON "sales" ("shop_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_customer_idx" ON "sales" ("customer_id");--> statement-breakpoint
CREATE INDEX "return_refunds_return_idx" ON "return_refunds" ("return_id");--> statement-breakpoint
CREATE INDEX "return_refunds_account_idx" ON "return_refunds" ("financial_account_id");--> statement-breakpoint
CREATE INDEX "sale_return_items_return_idx" ON "sale_return_items" ("return_id");--> statement-breakpoint
CREATE INDEX "sale_return_items_sale_item_idx" ON "sale_return_items" ("sale_item_id");--> statement-breakpoint
CREATE INDEX "sale_return_items_imei_idx" ON "sale_return_items" ("imei_device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_returns_shop_document_unique" ON "sale_returns" ("shop_id","document_no");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_returns_shop_id_unique" ON "sale_returns" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "sale_returns_original_sale_idx" ON "sale_returns" ("original_sale_id");--> statement-breakpoint
CREATE INDEX "sale_returns_replacement_sale_idx" ON "sale_returns" ("replacement_sale_id");--> statement-breakpoint
CREATE INDEX "service_payments_transaction_idx" ON "service_payments" ("service_transaction_id");--> statement-breakpoint
CREATE INDEX "service_payments_account_idx" ON "service_payments" ("financial_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_transactions_shop_document_unique" ON "service_transactions" ("shop_id","document_no");--> statement-breakpoint
CREATE UNIQUE INDEX "service_transactions_shop_id_unique" ON "service_transactions" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "service_transactions_shop_created_idx" ON "service_transactions" ("shop_id","created_at");--> statement-breakpoint
CREATE INDEX "service_transactions_type_idx" ON "service_transactions" ("service_type_id");--> statement-breakpoint
CREATE INDEX "service_transactions_provider_account_idx" ON "service_transactions" ("provider_account_id");--> statement-breakpoint
CREATE INDEX "service_transactions_status_idx" ON "service_transactions" ("shop_id","service_status");--> statement-breakpoint
CREATE INDEX "service_transactions_external_ref_idx" ON "service_transactions" ("external_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "service_types_shop_code_unique" ON "service_types" ("shop_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "service_types_shop_id_unique" ON "service_types" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "service_types_shop_active_idx" ON "service_types" ("shop_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sessions_shop_id_unique" ON "cash_sessions" ("shop_id","id");--> statement-breakpoint
CREATE INDEX "cash_sessions_shop_created_idx" ON "cash_sessions" ("shop_id","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sessions_one_open_per_account_idx" ON "cash_sessions" ("financial_account_id") WHERE "status" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_shop_name_unique" ON "expense_categories" ("shop_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_shop_id_unique" ON "expense_categories" ("shop_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_shop_document_unique" ON "expenses" ("shop_id","document_no");--> statement-breakpoint
CREATE INDEX "expenses_shop_date_idx" ON "expenses" ("shop_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" ("category_id");--> statement-breakpoint
CREATE INDEX "expenses_account_idx" ON "expenses" ("financial_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_sequences_shop_type_year_unique" ON "document_sequences" ("shop_id","document_type","year");--> statement-breakpoint
CREATE INDEX "audit_logs_shop_created_idx" ON "audit_logs" ("shop_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" ("actor_user_id");--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shop_memberships" ADD CONSTRAINT "shop_memberships_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shop_memberships" ADD CONSTRAINT "shop_memberships_shop_role_fk" FOREIGN KEY ("shop_id","role_id") REFERENCES "roles"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_shop_parent_fk" FOREIGN KEY ("shop_id","parent_id") REFERENCES "categories"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_shop_product_fk" FOREIGN KEY ("shop_id","product_id") REFERENCES "products"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_category_fk" FOREIGN KEY ("shop_id","category_id") REFERENCES "categories"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_brand_fk" FOREIGN KEY ("shop_id","brand_id") REFERENCES "brands"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_shop_parent_fk" FOREIGN KEY ("shop_id","parent_id") REFERENCES "ledger_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_shop_transaction_fk" FOREIGN KEY ("shop_id","ledger_transaction_id") REFERENCES "ledger_transactions"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_shop_account_fk" FOREIGN KEY ("shop_id","ledger_account_id") REFERENCES "ledger_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_shop_reversal_fk" FOREIGN KEY ("shop_id","reversal_of_id") REFERENCES "ledger_transactions"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_shop_source_fk" FOREIGN KEY ("shop_id","source_account_id") REFERENCES "financial_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_shop_destination_fk" FOREIGN KEY ("shop_id","destination_account_id") REFERENCES "financial_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_shop_ledger_fk" FOREIGN KEY ("shop_id","ledger_account_id") REFERENCES "ledger_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_shop_purchase_fk" FOREIGN KEY ("shop_id","purchase_id") REFERENCES "purchases"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_shop_variant_fk" FOREIGN KEY ("shop_id","variant_id") REFERENCES "product_variants"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_shop_purchase_fk" FOREIGN KEY ("shop_id","purchase_id") REFERENCES "purchases"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_shop_account_fk" FOREIGN KEY ("shop_id","financial_account_id") REFERENCES "financial_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shop_supplier_fk" FOREIGN KEY ("shop_id","supplier_id") REFERENCES "suppliers"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "imei_devices" ADD CONSTRAINT "imei_devices_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "imei_devices" ADD CONSTRAINT "imei_devices_shop_variant_fk" FOREIGN KEY ("shop_id","variant_id") REFERENCES "product_variants"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "imei_devices" ADD CONSTRAINT "imei_devices_shop_purchase_item_fk" FOREIGN KEY ("shop_id","purchase_item_id") REFERENCES "purchase_items"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_shop_variant_fk" FOREIGN KEY ("shop_id","variant_id") REFERENCES "product_variants"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_shop_variant_fk" FOREIGN KEY ("shop_id","variant_id") REFERENCES "product_variants"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_shop_imei_fk" FOREIGN KEY ("shop_id","imei_device_id") REFERENCES "imei_devices"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_shop_sale_fk" FOREIGN KEY ("shop_id","sale_id") REFERENCES "sales"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_shop_variant_fk" FOREIGN KEY ("shop_id","variant_id") REFERENCES "product_variants"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_shop_imei_fk" FOREIGN KEY ("shop_id","imei_device_id") REFERENCES "imei_devices"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_shop_sale_fk" FOREIGN KEY ("shop_id","sale_id") REFERENCES "sales"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_shop_account_fk" FOREIGN KEY ("shop_id","financial_account_id") REFERENCES "financial_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_shop_customer_fk" FOREIGN KEY ("shop_id","customer_id") REFERENCES "customers"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "return_refunds" ADD CONSTRAINT "return_refunds_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "return_refunds" ADD CONSTRAINT "return_refunds_shop_return_fk" FOREIGN KEY ("shop_id","return_id") REFERENCES "sale_returns"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "return_refunds" ADD CONSTRAINT "return_refunds_shop_account_fk" FOREIGN KEY ("shop_id","financial_account_id") REFERENCES "financial_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_shop_return_fk" FOREIGN KEY ("shop_id","return_id") REFERENCES "sale_returns"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_shop_sale_item_fk" FOREIGN KEY ("shop_id","sale_item_id") REFERENCES "sale_items"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_shop_imei_fk" FOREIGN KEY ("shop_id","imei_device_id") REFERENCES "imei_devices"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_shop_original_sale_fk" FOREIGN KEY ("shop_id","original_sale_id") REFERENCES "sales"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_shop_replacement_sale_fk" FOREIGN KEY ("shop_id","replacement_sale_id") REFERENCES "sales"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "service_payments" ADD CONSTRAINT "service_payments_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "service_payments" ADD CONSTRAINT "service_payments_shop_transaction_fk" FOREIGN KEY ("shop_id","service_transaction_id") REFERENCES "service_transactions"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "service_payments" ADD CONSTRAINT "service_payments_shop_account_fk" FOREIGN KEY ("shop_id","financial_account_id") REFERENCES "financial_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "service_transactions" ADD CONSTRAINT "service_transactions_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "service_transactions" ADD CONSTRAINT "service_transactions_shop_type_fk" FOREIGN KEY ("shop_id","service_type_id") REFERENCES "service_types"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "service_transactions" ADD CONSTRAINT "service_transactions_shop_customer_fk" FOREIGN KEY ("shop_id","customer_id") REFERENCES "customers"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "service_transactions" ADD CONSTRAINT "service_transactions_shop_provider_fk" FOREIGN KEY ("shop_id","provider_account_id") REFERENCES "financial_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_shop_account_fk" FOREIGN KEY ("shop_id","financial_account_id") REFERENCES "financial_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_shop_ledger_fk" FOREIGN KEY ("shop_id","ledger_account_id") REFERENCES "ledger_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shop_category_fk" FOREIGN KEY ("shop_id","category_id") REFERENCES "expense_categories"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shop_account_fk" FOREIGN KEY ("shop_id","financial_account_id") REFERENCES "financial_accounts"("shop_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE;