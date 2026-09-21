CREATE TYPE "public"."delivery_status" AS ENUM('draft', 'validated', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('entry', 'exit', 'adjustment', 'delivery');--> statement-breakpoint
CREATE TABLE "delivery_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_note_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(15, 3) NOT NULL,
	"unit" text DEFAULT 'unité' NOT NULL,
	"unit_price" numeric(15, 3) NOT NULL,
	"tva_code" text NOT NULL,
	"tva_rate" numeric(6, 3) NOT NULL,
	"fodec_rate" numeric(6, 3) DEFAULT '0.000' NOT NULL,
	CONSTRAINT "delivery_note_lines_qty" CHECK ("delivery_note_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "delivery_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "delivery_status" DEFAULT 'draft' NOT NULL,
	"number" text,
	"series_year" integer,
	"sequence" integer,
	"customer_id" uuid NOT NULL,
	"issue_date" date NOT NULL,
	"reference" text,
	"notes" text,
	"invoice_id" uuid,
	"validated_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_notes_has_number" CHECK ("delivery_notes"."status" = 'draft' OR "delivery_notes"."number" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "project_holdback_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"amount" numeric(15, 3) NOT NULL,
	"released_on" date NOT NULL,
	"reference" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holdback_release_amount" CHECK ("project_holdback_releases"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"unit" text DEFAULT 'u' NOT NULL,
	"quantity" numeric(15, 3) NOT NULL,
	"unit_price" numeric(15, 3) NOT NULL,
	"tva_code" text NOT NULL,
	"tva_rate" numeric(6, 3) NOT NULL,
	CONSTRAINT "project_lines_qty" CHECK ("project_lines"."quantity" > 0),
	CONSTRAINT "project_lines_price" CHECK ("project_lines"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "project_situation_lines" (
	"situation_id" uuid NOT NULL,
	"project_line_id" uuid NOT NULL,
	"cumulative_percent" numeric(6, 3) NOT NULL,
	"cumulative_quantity" numeric(15, 3) NOT NULL,
	CONSTRAINT "project_situation_lines_situation_id_project_line_id_pk" PRIMARY KEY("situation_id","project_line_id"),
	CONSTRAINT "situation_lines_percent" CHECK ("project_situation_lines"."cumulative_percent" >= 0 AND "project_situation_lines"."cumulative_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "project_situations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"invoice_id" uuid NOT NULL,
	"issue_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"customer_id" uuid NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"holdback_percent" numeric(6, 3) DEFAULT '0.000' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_holdback" CHECK ("projects"."holdback_percent" >= 0 AND "projects"."holdback_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity" numeric(15, 3) NOT NULL,
	"occurred_on" date NOT NULL,
	"reference" text,
	"notes" text,
	"delivery_note_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_nonzero" CHECK ("stock_movements"."quantity" <> 0),
	CONSTRAINT "stock_movements_entry_sign" CHECK ("stock_movements"."type" <> 'entry' OR "stock_movements"."quantity" > 0),
	CONSTRAINT "stock_movements_exit_sign" CHECK ("stock_movements"."type" <> 'exit' OR "stock_movements"."quantity" < 0)
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "guarantee_holdback_rate" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "guarantee_holdback" numeric(15, 3) DEFAULT '0.000' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "track_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "min_stock" numeric(15, 3) DEFAULT '0.000' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_delivery_note_id_delivery_notes_id_fk" FOREIGN KEY ("delivery_note_id") REFERENCES "public"."delivery_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_holdback_releases" ADD CONSTRAINT "project_holdback_releases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_holdback_releases" ADD CONSTRAINT "project_holdback_releases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lines" ADD CONSTRAINT "project_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_situation_lines" ADD CONSTRAINT "project_situation_lines_situation_id_project_situations_id_fk" FOREIGN KEY ("situation_id") REFERENCES "public"."project_situations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_situation_lines" ADD CONSTRAINT "project_situation_lines_project_line_id_project_lines_id_fk" FOREIGN KEY ("project_line_id") REFERENCES "public"."project_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_situations" ADD CONSTRAINT "project_situations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_situations" ADD CONSTRAINT "project_situations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_delivery_note_id_delivery_notes_id_fk" FOREIGN KEY ("delivery_note_id") REFERENCES "public"."delivery_notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_note_lines_note_idx" ON "delivery_note_lines" USING btree ("delivery_note_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_notes_number_uq" ON "delivery_notes" USING btree ("number") WHERE "delivery_notes"."number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "delivery_notes_customer_idx" ON "delivery_notes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "delivery_notes_invoice_idx" ON "delivery_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "project_lines_project_idx" ON "project_lines" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "project_situations_number_uq" ON "project_situations" USING btree ("project_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "project_situations_invoice_uq" ON "project_situations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "projects_customer_idx" ON "projects" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;