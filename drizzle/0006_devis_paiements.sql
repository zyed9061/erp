CREATE TYPE "public"."payment_method" AS ENUM('especes', 'cheque', 'virement', 'carte', 'effet');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'declined');--> statement-breakpoint
ALTER TYPE "public"."invoice_kind" ADD VALUE 'deposit_invoice';--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(15, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_payment_id_invoice_id_pk" PRIMARY KEY("payment_id","invoice_id"),
	CONSTRAINT "payment_allocations_amount" CHECK ("payment_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"amount" numeric(15, 3) NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"notes" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"voided_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_void_reason" CHECK (("payments"."voided_at" IS NULL) = ("payments"."void_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
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
	CONSTRAINT "quote_lines_qty" CHECK ("quote_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"number" text,
	"series_year" integer,
	"sequence" integer,
	"customer_id" uuid NOT NULL,
	"issue_date" date NOT NULL,
	"valid_until" date,
	"reference" text,
	"notes" text,
	"total_gross" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_discount" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_ht" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_fodec" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_tva_base" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_tva" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"total_ttc" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"sent_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_sent_has_number" CHECK ("quotes"."status" = 'draft' OR ("quotes"."number" IS NOT NULL AND "quotes"."sent_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "withholding_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"number" text NOT NULL,
	"certificate_date" date NOT NULL,
	"amount" numeric(15, 3) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withholding_cert_amount" CHECK ("withholding_certificates"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "quote_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "deposit_percent" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withholding_certificates" ADD CONSTRAINT "withholding_certificates_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withholding_certificates" ADD CONSTRAINT "withholding_certificates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_customer_idx" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payments_date_idx" ON "payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "quote_lines_quote_idx" ON "quote_lines" USING btree ("quote_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_uq" ON "quotes" USING btree ("number") WHERE "quotes"."number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "quotes" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "withholding_cert_uq" ON "withholding_certificates" USING btree ("invoice_id","number");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_quote_final_uq" ON "invoices" USING btree ("quote_id") WHERE "invoices"."kind" = 'invoice' AND "invoices"."quote_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invoices_quote_idx" ON "invoices" USING btree ("quote_id");