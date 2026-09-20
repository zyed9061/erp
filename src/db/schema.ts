import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const ROLES = ["admin", "comptable", "commercial", "lecture_seule"] as const;
export type Role = (typeof ROLES)[number];

export const roleEnum = pgEnum("role", ROLES);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("lecture_seule"),
  isActive: boolean("is_active").notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 du jeton stocké dans le cookie : le jeton brut n'est jamais persisté.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/**
 * Journal d'audit en ajout seul : un trigger (migration 0001) interdit
 * UPDATE, DELETE et TRUNCATE. Pas de clé étrangère volontairement, pour que
 * le journal reste intact quoi qu'il arrive aux autres tables.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    userId: uuid("user_id"),
    userEmail: text("user_email"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
  },
  (t) => [
    index("audit_entity_idx").on(t.entity, t.entityId),
    index("audit_occurred_idx").on(t.occurredAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuditEntry = typeof auditLog.$inferSelect;

// ---------------------------------------------------------------------------
// Phase 2 : référentiels
// Montants en NUMERIC(15,3) : le dinar a 3 décimales (millimes). Drizzle les
// renvoie en `string` pour ne jamais perdre de précision.
// ---------------------------------------------------------------------------

export const TAX_KINDS = ["tva", "fodec", "retenue"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];
export const taxKindEnum = pgEnum("tax_kind", TAX_KINDS);

export const TAX_BASES = ["ht", "ttc"] as const;
export type TaxBase = (typeof TAX_BASES)[number];
export const taxBaseEnum = pgEnum("tax_base", TAX_BASES);

export const TAX_REGIMES = ["reel", "forfaitaire"] as const;
export const taxRegimeEnum = pgEnum("tax_regime", TAX_REGIMES);

/** Société émettrice : une seule ligne (id = 1), l'application est mono-entreprise. */
export const companySettings = pgTable(
  "company_settings",
  {
    id: smallint("id").primaryKey().default(1),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    matriculeFiscal: text("matricule_fiscal"),
    legalForm: text("legal_form"),
    capital: numeric("capital", { precision: 15, scale: 3 }),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("TN"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    bankName: text("bank_name"),
    rib: text("rib"),
    taxRegime: taxRegimeEnum("tax_regime").notNull().default("reel"),
    vatRegistered: boolean("vat_registered").notNull().default(true),
    stampDutyEnabled: boolean("stamp_duty_enabled").notNull().default(true),
    stampDutyAmount: numeric("stamp_duty_amount", { precision: 15, scale: 3 })
      .notNull()
      .default("1.000"),
    // Base et seuil de la retenue à la source : non tranchés par la recherche (HT ou TTC ?),
    // donc configurables. La retenue ne s'applique que si la base atteint le seuil.
    withholdingBase: taxBaseEnum("withholding_base").notNull().default("ttc"),
    withholdingThreshold: numeric("withholding_threshold", { precision: 15, scale: 3 })
      .notNull()
      .default("0.000"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("company_singleton", sql`${t.id} = 1`)],
);

/**
 * Taux de taxes (TVA, FODEC, retenue à la source), en pourcentage.
 * Le taux d'une ligne existante est immuable (trigger, migration 0003) : pour
 * changer un taux, on désactive l'ancien et on en crée un nouveau. Les factures
 * copient de toute façon le taux appliqué.
 */
export const taxRates = pgTable(
  "tax_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    kind: taxKindEnum("kind").notNull(),
    rate: numeric("rate", { precision: 6, scale: 3 }).notNull(),
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tax_rates_code_uq").on(t.code),
    check("tax_rates_range", sql`${t.rate} >= 0 AND ${t.rate} <= 100`),
  ],
);

export const paymentTerms = pgTable(
  "payment_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    days: integer("days").notNull().default(0),
    endOfMonth: boolean("end_of_month").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("payment_terms_label_uq").on(t.label),
    // Une seule condition par défaut à la fois.
    uniqueIndex("payment_terms_one_default").on(t.isDefault).where(sql`${t.isDefault}`),
    check("payment_terms_days", sql`${t.days} >= 0`),
  ],
);

export const CUSTOMER_TYPES = ["entreprise", "particulier", "etranger"] as const;
export const customerTypeEnum = pgEnum("customer_type", CUSTOMER_TYPES);

export const CUSTOMER_TAX_STATUSES = ["assujetti", "exonere", "export", "non_assujetti"] as const;
export const customerTaxStatusEnum = pgEnum("customer_tax_status", CUSTOMER_TAX_STATUSES);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    type: customerTypeEnum("type").notNull().default("entreprise"),
    name: text("name").notNull(),
    matriculeFiscal: text("matricule_fiscal"),
    taxStatus: customerTaxStatusEnum("tax_status").notNull().default("assujetti"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("TN"),
    phone: text("phone"),
    email: text("email"),
    paymentTermId: uuid("payment_term_id").references(() => paymentTerms.id, { onDelete: "set null" }),
    stampExempt: boolean("stamp_exempt").notNull().default(false),
    withholdingApplies: boolean("withholding_applies").notNull().default(false),
    withholdingRateId: uuid("withholding_rate_id").references(() => taxRates.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customers_code_uq").on(t.code),
    index("customers_name_idx").on(t.name),
    index("customers_mf_idx").on(t.matriculeFiscal),
  ],
);

export const customerContacts = pgTable(
  "customer_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    role: text("role"),
    isBilling: boolean("is_billing").notNull().default(false),
  },
  (t) => [index("customer_contacts_customer_idx").on(t.customerId)],
);

export const PRODUCT_TYPES = ["bien", "service"] as const;
export const productTypeEnum = pgEnum("product_type", PRODUCT_TYPES);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    type: productTypeEnum("type").notNull().default("service"),
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit").notNull().default("unité"),
    unitPrice: numeric("unit_price", { precision: 15, scale: 3 }).notNull().default("0.000"),
    tvaRateId: uuid("tva_rate_id")
      .notNull()
      .references(() => taxRates.id, { onDelete: "restrict" }),
    fodecApplicable: boolean("fodec_applicable").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_code_uq").on(t.code),
    index("products_name_idx").on(t.name),
    check("products_price", sql`${t.unitPrice} >= 0`),
  ],
);

export const DOC_TYPES = [
  "invoice",
  "credit_note",
  "quote",
  "deposit_invoice",
  "delivery_note",
  "customer",
  "product",
] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const docTypeEnum = pgEnum("doc_type", DOC_TYPES);

/** Format de numérotation par type de document. */
export const documentSeriesConfig = pgTable(
  "document_series_config",
  {
    docType: docTypeEnum("doc_type").primaryKey(),
    prefix: text("prefix").notNull(),
    padLength: integer("pad_length").notNull().default(5),
    resetYearly: boolean("reset_yearly").notNull().default(true),
  },
  (t) => [check("doc_series_pad", sql`${t.padLength} BETWEEN 1 AND 12`)],
);

/**
 * Compteurs sans trou : une ligne par (type, exercice). `fiscal_year` vaut 0 pour
 * une numérotation continue. Incrémentés dans la transaction qui valide le document,
 * sous verrou de ligne : un ROLLBACK restitue le numéro (contrairement à une SEQUENCE).
 */
export const documentCounters = pgTable(
  "document_counters",
  {
    docType: docTypeEnum("doc_type").notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    lastNumber: integer("last_number").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.docType, t.fiscalYear] })],
);

export type CompanySettings = typeof companySettings.$inferSelect;
export type TaxRate = typeof taxRates.$inferSelect;
export type PaymentTerm = typeof paymentTerms.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type CustomerContact = typeof customerContacts.$inferSelect;
export type Product = typeof products.$inferSelect;

// ---------------------------------------------------------------------------
// Phase 3 : factures et avoirs
// Une facture validée est immuable : triggers (migration 0005) + corrections par avoir.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 4 : devis
// Un devis envoyé est verrouillé (seul son statut évolue) : trigger, migration 0007.
// ---------------------------------------------------------------------------

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const quoteStatusEnum = pgEnum("quote_status", QUOTE_STATUSES);

const quoteMoney = (name: string) => numeric(name, { precision: 15, scale: 3 }).notNull().default("0.000");

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: quoteStatusEnum("status").notNull().default("draft"),
    // Attribués à l'envoi uniquement (brouillon : null), sans trou.
    number: text("number"),
    seriesYear: integer("series_year"),
    sequence: integer("sequence"),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    validUntil: date("valid_until", { mode: "string" }),
    reference: text("reference"),
    notes: text("notes"),
    totalGross: quoteMoney("total_gross"),
    totalDiscount: quoteMoney("total_discount"),
    totalHt: quoteMoney("total_ht"),
    totalFodec: quoteMoney("total_fodec"),
    totalTvaBase: quoteMoney("total_tva_base"),
    totalTva: quoteMoney("total_tva"),
    totalTtc: quoteMoney("total_ttc"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("quotes_number_uq").on(t.number).where(sql`${t.number} IS NOT NULL`),
    index("quotes_customer_idx").on(t.customerId),
    check(
      "quotes_sent_has_number",
      sql`${t.status} = 'draft' OR (${t.number} IS NOT NULL AND ${t.sentAt} IS NOT NULL)`,
    ),
  ],
);

export const quoteLines = pgTable(
  "quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 15, scale: 3 }).notNull(),
    unit: text("unit").notNull().default("unité"),
    unitPrice: numeric("unit_price", { precision: 15, scale: 3 }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 6, scale: 3 }).notNull().default("0.000"),
    tvaCode: text("tva_code").notNull(),
    tvaRate: numeric("tva_rate", { precision: 6, scale: 3 }).notNull(),
    fodecRate: numeric("fodec_rate", { precision: 6, scale: 3 }).notNull().default("0.000"),
    lineGross: quoteMoney("line_gross"),
    lineDiscount: quoteMoney("line_discount"),
    lineNetHt: quoteMoney("line_net_ht"),
    lineFodec: quoteMoney("line_fodec"),
  },
  (t) => [
    index("quote_lines_quote_idx").on(t.quoteId, t.position),
    check("quote_lines_qty", sql`${t.quantity} > 0`),
  ],
);

export type Quote = typeof quotes.$inferSelect;
export type QuoteLine = typeof quoteLines.$inferSelect;

// ---------------------------------------------------------------------------
// Phase 3 (suite) : factures, avoirs et factures d'acompte
// ---------------------------------------------------------------------------

export const INVOICE_KINDS = ["invoice", "credit_note", "deposit_invoice"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const invoiceKindEnum = pgEnum("invoice_kind", INVOICE_KINDS);

export const INVOICE_STATUSES = ["draft", "validated"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const invoiceStatusEnum = pgEnum("invoice_status", INVOICE_STATUSES);

const money = (name: string) => numeric(name, { precision: 15, scale: 3 }).notNull().default("0.000");

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: invoiceKindEnum("kind").notNull().default("invoice"),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    // Attribués à la validation uniquement (brouillon : null). Voir nextDocumentNumber().
    number: text("number"),
    seriesYear: integer("series_year"),
    sequence: integer("sequence"),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    originalInvoiceId: uuid("original_invoice_id").references((): AnyPgColumn => invoices.id, {
      onDelete: "restrict",
    }),
    creditReason: text("credit_reason"),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }),
    paymentTermId: uuid("payment_term_id").references(() => paymentTerms.id, { onDelete: "set null" }),
    reference: text("reference"),
    notes: text("notes"),
    currency: text("currency").notNull().default("TND"),

    // Totaux (recalculés par le moteur de calcul à chaque enregistrement du brouillon).
    totalGross: money("total_gross"),
    totalDiscount: money("total_discount"),
    totalHt: money("total_ht"),
    totalFodec: money("total_fodec"),
    totalTvaBase: money("total_tva_base"),
    totalTva: money("total_tva"),
    totalTtc: money("total_ttc"),
    stampDuty: money("stamp_duty"),
    withholdingRate: numeric("withholding_rate", { precision: 6, scale: 3 }),
    withholdingAmount: money("withholding_amount"),
    netToPay: money("net_to_pay"),

    // Instantanés figés à la validation : la facture ne dépend plus des fiches client/société.
    // Lien avec le devis d'origine ; pour un acompte, pourcentage du devis facturé.
    quoteId: uuid("quote_id").references((): AnyPgColumn => quotes.id, { onDelete: "restrict" }),
    depositPercent: numeric("deposit_percent", { precision: 6, scale: 3 }),

    customerSnapshot: jsonb("customer_snapshot"),
    companySnapshot: jsonb("company_snapshot"),
    contentHash: text("content_hash"),

    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_number_uq").on(t.number).where(sql`${t.number} IS NOT NULL`),
    // Un devis ne donne lieu qu'à une seule facture finale (les acomptes sont d'un autre type).
    uniqueIndex("invoices_quote_final_uq")
      .on(t.quoteId)
      .where(sql`${t.kind} = 'invoice' AND ${t.quoteId} IS NOT NULL`),
    index("invoices_quote_idx").on(t.quoteId),
    uniqueIndex("invoices_series_uq")
      .on(t.kind, t.seriesYear, t.sequence)
      .where(sql`${t.sequence} IS NOT NULL`),
    index("invoices_customer_idx").on(t.customerId),
    index("invoices_original_idx").on(t.originalInvoiceId),
    index("invoices_issue_date_idx").on(t.issueDate),
    check(
      "invoices_validated_has_number",
      sql`${t.status} = 'draft' OR (${t.number} IS NOT NULL AND ${t.validatedAt} IS NOT NULL AND ${t.contentHash} IS NOT NULL)`,
    ),
    check(
      "invoices_credit_note_link",
      sql`(${t.kind} = 'credit_note') = (${t.originalInvoiceId} IS NOT NULL)`,
    ),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 15, scale: 3 }).notNull(),
    unit: text("unit").notNull().default("unité"),
    unitPrice: numeric("unit_price", { precision: 15, scale: 3 }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 6, scale: 3 }).notNull().default("0.000"),
    // Taux copiés au moment de la saisie : une évolution des référentiels ne change jamais la ligne.
    tvaCode: text("tva_code").notNull(),
    tvaRate: numeric("tva_rate", { precision: 6, scale: 3 }).notNull(),
    fodecRate: numeric("fodec_rate", { precision: 6, scale: 3 }).notNull().default("0.000"),
    lineGross: money("line_gross"),
    lineDiscount: money("line_discount"),
    lineNetHt: money("line_net_ht"),
    lineFodec: money("line_fodec"),
  },
  (t) => [
    index("invoice_lines_invoice_idx").on(t.invoiceId, t.position),
    check("invoice_lines_qty", sql`${t.quantity} > 0`),
    check("invoice_lines_discount", sql`${t.discountPercent} >= 0 AND ${t.discountPercent} <= 100`),
  ],
);

/** Récapitulatif par taxe et par taux : alimente le PDF, le TEIF et les états de TVA. */
export const invoiceTaxLines = pgTable(
  "invoice_tax_lines",
  {
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    kind: taxKindEnum("kind").notNull(),
    rate: numeric("rate", { precision: 6, scale: 3 }).notNull(),
    base: money("base"),
    amount: money("amount"),
  },
  (t) => [primaryKey({ columns: [t.invoiceId, t.kind, t.rate] })],
);

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type InvoiceTaxLine = typeof invoiceTaxLines.$inferSelect;

// ---------------------------------------------------------------------------
// Phase 4 : paiements, imputations, certificats de retenue
// Un paiement n'est jamais supprimé ni modifié : on l'annule (voided_at). Les imputations sont
// immuables (triggers, migration 0007). Le net à payer d'une facture déduit déjà la retenue à la
// source : les paiements enregistrent uniquement l'argent réellement encaissé.
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS = ["especes", "cheque", "virement", "carte", "effet"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const paymentMethodEnum = pgEnum("payment_method", PAYMENT_METHODS);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    paymentDate: date("payment_date", { mode: "string" }).notNull(),
    amount: numeric("amount", { precision: 15, scale: 3 }).notNull(),
    method: paymentMethodEnum("method").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_customer_idx").on(t.customerId),
    index("payments_date_idx").on(t.paymentDate),
    check("payments_amount", sql`${t.amount} > 0`),
    check("payments_void_reason", sql`(${t.voidedAt} IS NULL) = (${t.voidReason} IS NULL)`),
  ],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 15, scale: 3 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.paymentId, t.invoiceId] }),
    index("payment_allocations_invoice_idx").on(t.invoiceId),
    check("payment_allocations_amount", sql`${t.amount} > 0`),
  ],
);

/** Certificat de retenue à la source remis par le client (suivi du crédit d'impôt). */
export const withholdingCertificates = pgTable(
  "withholding_certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    number: text("number").notNull(),
    certificateDate: date("certificate_date", { mode: "string" }).notNull(),
    amount: numeric("amount", { precision: 15, scale: 3 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("withholding_cert_uq").on(t.invoiceId, t.number),
    check("withholding_cert_amount", sql`${t.amount} > 0`),
  ],
);

/**
 * Soldes des factures validées (vue SQL, migration 0007) :
 * reste dû = net à payer − avoirs validés − paiements imputés (paiements non annulés).
 */
export const invoiceBalances = pgView("invoice_balances", {
  invoiceId: uuid("invoice_id"),
  netToPay: numeric("net_to_pay", { precision: 15, scale: 3 }),
  credited: numeric("credited"),
  paid: numeric("paid"),
  due: numeric("due"),
}).existing();

export type Payment = typeof payments.$inferSelect;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type WithholdingCertificate = typeof withholdingCertificates.$inferSelect;
