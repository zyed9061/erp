CREATE TYPE "public"."recurring_frequency" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recurring_run_status" AS ENUM('generated', 'failed');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TABLE "recurring_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"period_index" integer NOT NULL,
	"scheduled_date" date NOT NULL,
	"status" "recurring_run_status" NOT NULL,
	"invoice_id" uuid,
	"error" text,
	"email_status" text,
	"email_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_template_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(15, 3) NOT NULL,
	"unit" text DEFAULT 'unité' NOT NULL,
	"unit_price" numeric(15, 3) NOT NULL,
	"discount_percent" numeric(6, 3) DEFAULT '0.000' NOT NULL,
	"tva_rate_id" uuid NOT NULL,
	"fodec_applicable" boolean DEFAULT false NOT NULL,
	CONSTRAINT "recurring_lines_qty" CHECK ("recurring_template_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "recurring_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"frequency" "recurring_frequency" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"run_index" integer DEFAULT 0 NOT NULL,
	"next_run_date" date NOT NULL,
	"status" "recurring_status" DEFAULT 'active' NOT NULL,
	"auto_validate" boolean DEFAULT false NOT NULL,
	"auto_send" boolean DEFAULT false NOT NULL,
	"reference" text,
	"notes" text,
	"payment_term_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_dates" CHECK ("recurring_templates"."end_date" IS NULL OR "recurring_templates"."end_date" >= "recurring_templates"."start_date"),
	CONSTRAINT "recurring_auto_send" CHECK (NOT "recurring_templates"."auto_send" OR "recurring_templates"."auto_validate")
);
--> statement-breakpoint
ALTER TABLE "recurring_runs" ADD CONSTRAINT "recurring_runs_template_id_recurring_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."recurring_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_runs" ADD CONSTRAINT "recurring_runs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template_lines" ADD CONSTRAINT "recurring_template_lines_template_id_recurring_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."recurring_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template_lines" ADD CONSTRAINT "recurring_template_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template_lines" ADD CONSTRAINT "recurring_template_lines_tva_rate_id_tax_rates_id_fk" FOREIGN KEY ("tva_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_payment_term_id_payment_terms_id_fk" FOREIGN KEY ("payment_term_id") REFERENCES "public"."payment_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_runs_period_uq" ON "recurring_runs" USING btree ("template_id","period_index") WHERE "recurring_runs"."status" = 'generated';--> statement-breakpoint
CREATE INDEX "recurring_runs_template_idx" ON "recurring_runs" USING btree ("template_id","created_at");--> statement-breakpoint
CREATE INDEX "recurring_lines_template_idx" ON "recurring_template_lines" USING btree ("template_id","position");--> statement-breakpoint
CREATE INDEX "recurring_templates_next_idx" ON "recurring_templates" USING btree ("status","next_run_date");