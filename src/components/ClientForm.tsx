import type { Client } from "@/generated/prisma/client";

export function ClientForm({
  action,
  client,
}: {
  action: (formData: FormData) => void;
  client?: Client;
}) {
  return (
    <form action={action} className="max-w-xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          <select
            name="type"
            defaultValue={client?.type ?? "ENTREPRISE"}
            className="input"
          >
            <option value="ENTREPRISE">Entreprise</option>
            <option value="PARTICULIER">Particulier</option>
          </select>
        </Field>
        <Field label="Nom / Raison sociale">
          <input name="nom" defaultValue={client?.nom} required className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Matricule fiscal">
          <input name="matriculeFiscal" defaultValue={client?.matriculeFiscal ?? ""} className="input" />
        </Field>
        <Field label="Email">
          <input type="email" name="email" defaultValue={client?.email ?? ""} className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Telephone">
          <input name="telephone" defaultValue={client?.telephone ?? ""} className="input" />
        </Field>
        <Field label="Ville">
          <input name="ville" defaultValue={client?.ville ?? ""} className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Code postal">
          <input name="codePostal" defaultValue={client?.codePostal ?? ""} className="input" />
        </Field>
        <Field label="Pays">
          <input name="pays" defaultValue={client?.pays ?? "Tunisie"} className="input" />
        </Field>
      </div>

      <Field label="Adresse">
        <input name="adresse" defaultValue={client?.adresse ?? ""} className="input" />
      </Field>

      <Field label="Notes">
        <textarea name="notes" defaultValue={client?.notes ?? ""} rows={3} className="input" />
      </Field>

      <button
        type="submit"
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Enregistrer
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
