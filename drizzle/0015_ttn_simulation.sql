CREATE TABLE "einvoice_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"export_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"ttn_reference" text,
	"signature_algorithm" text NOT NULL,
	"signed_xml" text NOT NULL,
	"signed_xml_sha256" text NOT NULL,
	"message" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "einvoice_submissions_status" CHECK ("einvoice_submissions"."status" IN ('accepted', 'rejected')),
	CONSTRAINT "einvoice_submissions_mode" CHECK ("einvoice_submissions"."mode" IN ('mock')),
	CONSTRAINT "einvoice_submissions_accepted_ref" CHECK ("einvoice_submissions"."status" <> 'accepted' OR "einvoice_submissions"."ttn_reference" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "einvoice_submissions" ADD CONSTRAINT "einvoice_submissions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einvoice_submissions" ADD CONSTRAINT "einvoice_submissions_export_id_einvoice_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."einvoice_exports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einvoice_submissions" ADD CONSTRAINT "einvoice_submissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "einvoice_submissions_invoice_idx" ON "einvoice_submissions" USING btree ("invoice_id","created_at");