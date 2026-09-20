CREATE TYPE "public"."customer_tax_status" AS ENUM('assujetti', 'exonere', 'export', 'non_assujetti');--> statement-breakpoint
CREATE TYPE "public"."customer_type" AS ENUM('entreprise', 'particulier', 'etranger');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('invoice', 'credit_note', 'quote', 'deposit_invoice', 'delivery_note', 'customer', 'product');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('bien', 'service');--> statement-breakpoint
CREATE TYPE "public"."tax_kind" AS ENUM('tva', 'fodec', 'retenue');--> statement-breakpoint
CREATE TYPE "public"."tax_regime" AS ENUM('reel', 'forfaitaire');--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"matricule_fiscal" text,
	"legal_form" text,
	"capital" numeric(15, 3),
	"address" text,
	"city" text,
	"postal_code" text,
	"country" text DEFAULT 'TN' NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"bank_name" text,
	"rib" text,
	"tax_regime" "tax_regime" DEFAULT 'reel' NOT NULL,
	"vat_registered" boolean DEFAULT true NOT NULL,
	"stamp_duty_enabled" boolean DEFAULT true NOT NULL,
	"stamp_duty_amount" numeric(15, 3) DEFAULT '1.000' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_singleton" CHECK ("company_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "customer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text,
	"is_billing" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" "customer_type" DEFAULT 'entreprise' NOT NULL,
	"name" text NOT NULL,
	"matricule_fiscal" text,
	"tax_status" "customer_tax_status" DEFAULT 'assujetti' NOT NULL,
	"address" text,
	"city" text,
	"postal_code" text,
	"country" text DEFAULT 'TN' NOT NULL,
	"phone" text,
	"email" text,
	"payment_term_id" uuid,
	"stamp_exempt" boolean DEFAULT false NOT NULL,
	"withholding_applies" boolean DEFAULT false NOT NULL,
	"withholding_rate_id" uuid,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"doc_type" "doc_type" NOT NULL,
	"fiscal_year" integer NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_counters_doc_type_fiscal_year_pk" PRIMARY KEY("doc_type","fiscal_year")
);
--> statement-breakpoint
CREATE TABLE "document_series_config" (
	"doc_type" "doc_type" PRIMARY KEY NOT NULL,
	"prefix" text NOT NULL,
	"pad_length" integer DEFAULT 5 NOT NULL,
	"reset_yearly" boolean DEFAULT true NOT NULL,
	CONSTRAINT "doc_series_pad" CHECK ("document_series_config"."pad_length" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "payment_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"days" integer DEFAULT 0 NOT NULL,
	"end_of_month" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "payment_terms_days" CHECK ("payment_terms"."days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" "product_type" DEFAULT 'service' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit" text DEFAULT 'unité' NOT NULL,
	"unit_price" numeric(15, 3) DEFAULT '0.000' NOT NULL,
	"tva_rate_id" uuid NOT NULL,
	"fodec_applicable" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price" CHECK ("products"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"kind" "tax_kind" NOT NULL,
	"rate" numeric(6, 3) NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_rates_range" CHECK ("tax_rates"."rate" >= 0 AND "tax_rates"."rate" <= 100)
);
--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_payment_term_id_payment_terms_id_fk" FOREIGN KEY ("payment_term_id") REFERENCES "public"."payment_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_withholding_rate_id_tax_rates_id_fk" FOREIGN KEY ("withholding_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tva_rate_id_tax_rates_id_fk" FOREIGN KEY ("tva_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_contacts_customer_idx" ON "customer_contacts" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_code_uq" ON "customers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "customers_mf_idx" ON "customers" USING btree ("matricule_fiscal");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_terms_label_uq" ON "payment_terms" USING btree ("label");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_terms_one_default" ON "payment_terms" USING btree ("is_default") WHERE "payment_terms"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "products_code_uq" ON "products" USING btree ("code");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_code_uq" ON "tax_rates" USING btree ("code");