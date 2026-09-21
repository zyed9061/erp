CREATE TYPE "public"."email_kind" AS ENUM('invoice', 'quote', 'reminder');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "email_kind" NOT NULL,
	"invoice_id" uuid,
	"quote_id" uuid,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"status" "email_status" NOT NULL,
	"error" text,
	"message_id" text,
	"attachment_name" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_target" CHECK ("email_log"."invoice_id" IS NOT NULL OR "email_log"."quote_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "reminder_rules" (
	"level" smallint PRIMARY KEY NOT NULL,
	"days_after_due" integer NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reminder_rules_level" CHECK ("reminder_rules"."level" BETWEEN 1 AND 9),
	CONSTRAINT "reminder_rules_days" CHECK ("reminder_rules"."days_after_due" BETWEEN 1 AND 365)
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"level" smallint NOT NULL,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"to_email" text NOT NULL,
	"method" text NOT NULL,
	"email_log_id" uuid,
	"error" text,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_by" uuid,
	CONSTRAINT "reminders_method" CHECK ("reminders"."method" IN ('auto', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_email_log_id_email_log_id_fk" FOREIGN KEY ("email_log_id") REFERENCES "public"."email_log"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_invoice_idx" ON "email_log" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "email_log_quote_idx" ON "email_log" USING btree ("quote_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_active_uq" ON "reminders" USING btree ("invoice_id","level") WHERE "reminders"."status" <> 'failed';--> statement-breakpoint
CREATE INDEX "reminders_invoice_idx" ON "reminders" USING btree ("invoice_id");