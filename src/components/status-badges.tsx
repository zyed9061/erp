import type { DeliveryStatus, InvoiceKind, InvoiceStatus, ProjectStatus, QuoteStatus, RecurringStatus } from "@/db/schema";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/invoicing/payments";
import { Badge, type Tone } from "./ui";

/** Pastilles d'état : une couleur par sens (vert = terminé/payé, orange = en attente, rouge = problème, bleu = actif, gris = brouillon). */

export function InvoiceStatusBadge({ status, kind }: { status: InvoiceStatus; kind?: InvoiceKind }) {
  if (status === "draft") return <Badge tone="neutral">Brouillon</Badge>;
  return <Badge tone={kind === "credit_note" ? "violet" : "info"}>Validé</Badge>;
}

const PAYMENT_TONES: Record<PaymentStatus, Tone> = { unpaid: "warn", partial: "warn", paid: "ok", overpaid: "violet" };

export function PaymentBadge({ status, overdue }: { status: PaymentStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <Badge tone={PAYMENT_TONES[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>
      {overdue && <Badge tone="bad">En retard</Badge>}
    </span>
  );
}

const QUOTE: Record<QuoteStatus, { label: string; tone: Tone }> = {
  draft: { label: "Brouillon", tone: "neutral" }, sent: { label: "Envoyé", tone: "info" },
  accepted: { label: "Accepté", tone: "ok" }, declined: { label: "Refusé", tone: "bad" },
};
export const QuoteBadge = ({ status }: { status: QuoteStatus }) => <Badge tone={QUOTE[status].tone}>{QUOTE[status].label}</Badge>;

const DELIVERY: Record<DeliveryStatus, { label: string; tone: Tone }> = {
  draft: { label: "Brouillon", tone: "neutral" }, validated: { label: "Validé", tone: "ok" }, cancelled: { label: "Annulé", tone: "bad" },
};
export const DeliveryBadge = ({ status }: { status: DeliveryStatus }) => <Badge tone={DELIVERY[status].tone}>{DELIVERY[status].label}</Badge>;

const PROJECT: Record<ProjectStatus, { label: string; tone: Tone }> = {
  active: { label: "En cours", tone: "info" }, completed: { label: "Terminé", tone: "ok" }, cancelled: { label: "Annulé", tone: "bad" },
};
export const ProjectBadge = ({ status }: { status: ProjectStatus }) => <Badge tone={PROJECT[status].tone}>{PROJECT[status].label}</Badge>;

const RECURRING: Record<RecurringStatus, { label: string; tone: Tone }> = {
  active: { label: "Actif", tone: "ok" }, paused: { label: "En pause", tone: "warn" }, ended: { label: "Terminé", tone: "neutral" },
};
export const RecurringBadge = ({ status }: { status: RecurringStatus }) => <Badge tone={RECURRING[status].tone}>{RECURRING[status].label}</Badge>;
