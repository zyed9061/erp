CREATE TABLE "einvoice_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"generator_version" text NOT NULL,
	"xml" text NOT NULL,
	"xml_sha256" text NOT NULL,
	"invoice_content_hash" text NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "einvoice_exports" ADD CONSTRAINT "einvoice_exports_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einvoice_exports" ADD CONSTRAINT "einvoice_exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "einvoice_exports_invoice_version_uq" ON "einvoice_exports" USING btree ("invoice_id","generator_version");