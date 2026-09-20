CREATE TYPE "public"."invoice_kind" AS ENUM('invoice', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'validated');--> statement-breakpoint
CREATE TYPE "public"."tax_base" AS ENUM('ht', 'ttc');--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(15, 3) NOT NULL,
	"unit" text DEFAULT 'unité' NOT NULL,
	"unit_price" numeric(15, 3) NOT NULL,
	"discount_percent" numeric(6, 3) DEFAULT '0.000' NOT NULL,
	"tva_code" text NOT NULL,
	"tva_rate" numeric(6, 3) NOT NULL,
	"fodec_rate" numeric(6, 3) DEFAULT '0.000' NOT NULL,
	"line_gross" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"line_discount" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"line_net_ht" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"line_fodec" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	CONSTRAINT "invoice_lines_qty" CHECK ("invoice_lines"."quantity" > 0),
	CONSTRAINT "invoice_lines_discount" CHECK ("invoice_lines"."discount_percent" >= 0 AND "invoice_lines"."discount_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "invoice_tax_lines" (
	"invoice_id" uuid NOT NULL,
	"kind" "tax_kind" NOT NULL,
	"rate" numeric(6, 3) NOT NULL,
	"base" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"amount" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	CONSTRAINT "invoice_tax_lines_invoice_id_kind_rate_pk" PRIMARY KEY("invoice_id","kind","rate")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "invoice_kind" DEFAULT 'invoice' NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"number" text,
	"series_year" integer,
	"sequence" integer,
	"customer_id" uuid NOT NULL,
	"original_invoice_id" uuid,
	"credit_reason" text,
	"issue_date" date NOT NULL,
	"due_date" date,
	"payment_term_id" uuid,
	"reference" text,
	"notes" text,
	"currency" text DEFAULT 'TND' NOT NULL,
	"total_gross" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_discount" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_ht" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_fodec" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_tva_base" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_tva" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_ttc" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"stamp_duty" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"withholding_rate" numeric(6, 3),
	"withholding_amount" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"net_to_pay" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"customer_snapshot" jsonb,
	"company_snapshot" jsonb,
	"content_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_validated_has_number" CHECK ("invoices"."status" = 'draft' OR ("invoices"."number" IS NOT NULL AND "invoices"."validated_at" IS NOT NULL AND "invoices"."content_hash" IS NOT NULL)),
	CONSTRAINT "invoices_credit_note_link" CHECK (("invoices"."kind" = 'credit_note') = ("invoices"."original_invoice_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "withholding_base" "tax_base" DEFAULT 'ttc' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "withholding_threshold" numeric(15, 3) DEFAULT '0.000' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_tax_lines" ADD CONSTRAINT "invoice_tax_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_original_invoice_id_invoices_id_fk" FOREIGN KEY ("original_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_term_id_payment_terms_id_fk" FOREIGN KEY ("payment_term_id") REFERENCES "public"."payment_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("number") WHERE "invoices"."number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_series_uq" ON "invoices" USING btree ("kind","series_year","sequence") WHERE "invoices"."sequence" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_original_idx" ON "invoices" USING btree ("original_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_issue_date_idx" ON "invoices" USING btree ("issue_date");