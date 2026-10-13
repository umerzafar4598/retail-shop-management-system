CREATE TABLE "cash_drawer_defaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shop_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"assigned_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_drawer_defaults_purpose_valid" CHECK ("purpose" IN ('RETAIL', 'SERVICES'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cash_drawer_defaults_shop_purpose_unique" ON "cash_drawer_defaults" ("shop_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_drawer_defaults_shop_account_unique" ON "cash_drawer_defaults" ("shop_id","financial_account_id");--> statement-breakpoint
CREATE INDEX "cash_drawer_defaults_account_idx" ON "cash_drawer_defaults" ("financial_account_id");--> statement-breakpoint
ALTER TABLE "cash_drawer_defaults" ADD CONSTRAINT "cash_drawer_defaults_shop_id_shops_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cash_drawer_defaults" ADD CONSTRAINT "cash_drawer_defaults_shop_account_fk" FOREIGN KEY ("shop_id","financial_account_id") REFERENCES "financial_accounts"("shop_id","id") ON DELETE RESTRICT;