import { RECURRING_FREQUENCIES } from "@/db/schema";
import { FREQUENCY_LABELS } from "@/lib/invoicing/recurring";

/** Champs propres au modèle récurrent, insérés dans l'éditeur de lignes (formulaire HTML natif). */
export function RecurringExtraFields({
  defaults,
}: {
  defaults: { name: string; frequency: string; endDate: string; autoValidate: boolean; autoSend: boolean };
}) {
  return (
    <>
      <label className="block space-y-1 sm:col-span-2">
        <span className="text-sm">Nom du modèle *</span>
        <input className="input" name="name" defaultValue={defaults.name} required maxLength={120} placeholder="Abonnement maintenance" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Fréquence *</span>
        <select className="input" name="frequency" defaultValue={defaults.frequency}>
          {RECURRING_FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Dernière échéance (facultatif)</span>
        <input className="input" type="date" name="endDate" defaultValue={defaults.endDate} />
      </label>
      <div className="sm:col-span-2 space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoValidate" defaultChecked={defaults.autoValidate} />
          Valider et numéroter automatiquement (sinon, un brouillon est créé pour relecture)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoSend" defaultChecked={defaults.autoSend} />
          Envoyer la facture validée par e-mail au client (exige la validation automatique)
        </label>
      </div>
    </>
  );
}
