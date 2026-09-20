import { db } from "@/db";
import { TAX_REGIMES } from "@/db/schema";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { getCompany } from "@/lib/company";
import { Field, Flash } from "@/components/ui";
import { updateCompanyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const canWrite = can(user.role, "settings:manage");
  const c = await getCompany(db);
  const { ok, error } = await searchParams;

  return (
    <div className="space-y-4">
      <Flash ok={ok} error={error} />
      <form action={updateCompanyAction} className="card p-4">
        <fieldset disabled={!canWrite} className="grid gap-3 sm:grid-cols-2">
          <Field label="Raison sociale *"><input className="input" name="legalName" defaultValue={c.legalName} required maxLength={200} /></Field>
          <Field label="Nom commercial"><input className="input" name="tradeName" defaultValue={c.tradeName ?? ""} maxLength={200} /></Field>
          <Field label="Matricule fiscal"><input className="input" name="matriculeFiscal" defaultValue={c.matriculeFiscal ?? ""} maxLength={30} /></Field>
          <Field label="Forme juridique"><input className="input" name="legalForm" defaultValue={c.legalForm ?? ""} placeholder="SARL, SA, personne physique…" /></Field>
          <Field label="Capital (DT)"><input className="input" name="capital" inputMode="decimal" defaultValue={c.capital ?? ""} /></Field>
          <Field label="Régime fiscal">
            <select className="input" name="taxRegime" defaultValue={c.taxRegime}>
              {TAX_REGIMES.map((r) => <option key={r} value={r}>{r === "reel" ? "Régime réel" : "Régime forfaitaire"}</option>)}
            </select>
          </Field>
          <Field label="Adresse" className="sm:col-span-2"><input className="input" name="address" defaultValue={c.address ?? ""} maxLength={300} /></Field>
          <Field label="Ville"><input className="input" name="city" defaultValue={c.city ?? ""} /></Field>
          <Field label="Code postal"><input className="input" name="postalCode" defaultValue={c.postalCode ?? ""} /></Field>
          <Field label="Téléphone"><input className="input" name="phone" defaultValue={c.phone ?? ""} /></Field>
          <Field label="E-mail"><input className="input" name="email" type="email" defaultValue={c.email ?? ""} /></Field>
          <Field label="Site web" className="sm:col-span-2"><input className="input" name="website" defaultValue={c.website ?? ""} /></Field>
          <Field label="Banque"><input className="input" name="bankName" defaultValue={c.bankName ?? ""} /></Field>
          <Field label="RIB"><input className="input" name="rib" defaultValue={c.rib ?? ""} maxLength={40} /></Field>

          <div className="sm:col-span-2 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="vatRegistered" defaultChecked={c.vatRegistered} /> Assujettie à la TVA
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="stampDutyEnabled" defaultChecked={c.stampDutyEnabled} /> Ajouter le timbre fiscal aux factures
            </label>
          </div>
          <Field label="Montant du timbre fiscal (DT)" hint="1,000 DT d'après la recherche : à confirmer auprès de votre expert-comptable">
            <input className="input" name="stampDutyAmount" inputMode="decimal" defaultValue={c.stampDutyAmount} required />
          </Field>
          <Field label="Base de la retenue à la source" hint="Sources divergentes (HT ou TTC) : à faire confirmer par votre expert-comptable">
            <select className="input" name="withholdingBase" defaultValue={c.withholdingBase}>
              <option value="ttc">Montant TTC (hors timbre)</option>
              <option value="ht">Montant HT</option>
            </select>
          </Field>
          <Field label="Seuil d'application de la retenue (DT)" hint="0 = toujours appliquée quand le client y est soumis">
            <input className="input" name="withholdingThreshold" inputMode="decimal" defaultValue={c.withholdingThreshold} required />
          </Field>
          {canWrite && <div className="sm:col-span-2"><button className="btn">Enregistrer</button></div>}
        </fieldset>
      </form>
    </div>
  );
}
