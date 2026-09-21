import type { EmailLogEntry } from "@/db/schema";
import { Field } from "@/components/ui";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Tunis" });
const KIND_LABELS = { invoice: "Envoi", quote: "Envoi", reminder: "Relance" } as const;

/** PDF (aperçu, téléchargement), formulaire d'envoi par e-mail et historique des envois d'un document. */
export function SendPanel({
  pdfHref, action, id, canSend, defaultTo, history,
}: {
  pdfHref: string;
  action: (formData: FormData) => Promise<void>;
  id: string;
  canSend: boolean;
  defaultTo: string | null;
  history: EmailLogEntry[];
}) {
  return (
    <section className="card p-4 space-y-3">
      <h2 className="font-medium">PDF et envoi par e-mail</h2>
      <div className="flex gap-2 flex-wrap">
        <a className="btn btn-ghost" href={pdfHref} target="_blank" rel="noopener">Ouvrir le PDF</a>
        <a className="btn btn-ghost" href={`${pdfHref}?download=1`}>Télécharger</a>
      </div>

      {canSend && (
        <form action={action} className="grid gap-3 sm:grid-cols-2 items-end border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <input type="hidden" name="id" value={id} />
          <Field label="Destinataire" hint={defaultTo ? `Par défaut : ${defaultTo}` : "Aucune adresse enregistrée pour ce client"}>
            <input className="input" name="to" type="email" placeholder={defaultTo ?? "adresse e-mail"} required={!defaultTo} maxLength={200} />
          </Field>
          <Field label="Message (facultatif)">
            <input className="input" name="message" maxLength={2000} placeholder="Ajouté au corps de l'e-mail" />
          </Field>
          <div className="sm:col-span-2"><button className="btn">Envoyer par e-mail avec le PDF</button></div>
        </form>
      )}

      {history.length > 0 && (
        <ul className="text-sm space-y-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
          {history.map((h) => (
            <li key={h.id}>
              {dateFmt.format(h.createdAt)} · {KIND_LABELS[h.kind]} à {h.toEmail} ·{" "}
              {h.status === "sent"
                ? "envoyé"
                : <span style={{ color: "var(--danger)" }}>échec ({h.error})</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
