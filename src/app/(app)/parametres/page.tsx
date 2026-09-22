import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/PageHeader";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { updateCompanyProfile } from "@/lib/actions/company";

export default async function ParametresPage() {
  const [session, companyProfile] = await Promise.all([auth(), prisma.companyProfile.findFirst()]);

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <ToastOnParam />
      </Suspense>
      <PageHeader
        title="Parametres"
        description="Informations du compte et de l'entreprise utilisees sur vos documents."
      />

      <div className="rounded-xl border border-neutral-200 bg-white shadow-xs p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Mon profil</h2>
        <dl className="grid max-w-md grid-cols-2 gap-y-2 text-sm">
          <dt className="text-neutral-500">Nom</dt>
          <dd className="text-neutral-900">{session?.user?.name ?? "-"}</dd>
          <dt className="text-neutral-500">Email</dt>
          <dd className="text-neutral-900">{session?.user?.email ?? "-"}</dd>
          <dt className="text-neutral-500">Role</dt>
          <dd className="text-neutral-900">{session?.user?.role ?? "-"}</dd>
        </dl>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white shadow-xs p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Entreprise</h2>
        <form action={updateCompanyProfile} className="grid max-w-2xl grid-cols-2 gap-4">
          <Field label="Raison sociale">
            <input name="nom" defaultValue={companyProfile?.nom ?? ""} required className="input" />
          </Field>
          <Field label="Matricule fiscal">
            <input
              name="matriculeFiscal"
              defaultValue={companyProfile?.matriculeFiscal ?? ""}
              className="input"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              name="email"
              defaultValue={companyProfile?.email ?? ""}
              className="input"
            />
          </Field>
          <Field label="Telephone">
            <input name="telephone" defaultValue={companyProfile?.telephone ?? ""} className="input" />
          </Field>
          <Field label="Adresse">
            <input name="adresse" defaultValue={companyProfile?.adresse ?? ""} className="input" />
          </Field>
          <Field label="Ville">
            <input name="ville" defaultValue={companyProfile?.ville ?? ""} className="input" />
          </Field>
          <Field label="Code postal">
            <input name="codePostal" defaultValue={companyProfile?.codePostal ?? ""} className="input" />
          </Field>
          <Field label="Pays">
            <input name="pays" defaultValue={companyProfile?.pays ?? "Tunisie"} className="input" />
          </Field>
          <Field label="Devise">
            <input name="devise" defaultValue={companyProfile?.devise ?? "TND"} className="input" />
          </Field>
          <Field label="Taux timbre fiscal">
            <input
              type="number"
              step="0.001"
              name="tauxTimbreFiscal"
              defaultValue={companyProfile ? Number(companyProfile.tauxTimbreFiscal) : 1}
              className="input"
            />
          </Field>
          <div className="col-span-2">
            <button
              type="submit"
              className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
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
