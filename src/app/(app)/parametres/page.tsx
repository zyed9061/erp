import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/PageHeader";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { updateCompanyProfile } from "@/lib/actions/company";
import { getT } from "@/i18n/server";
import { Building2, UserRound } from "lucide-react";
import { FadeIn } from "@/components/motion/Motion";
import { SubmitButton } from "@/components/ui/FormActions";

export default async function ParametresPage() {
  const [t, session, companyProfile] = await Promise.all([
    getT(),
    auth(),
    prisma.companyProfile.findFirst(),
  ]);
  const role = session?.user?.role;

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <ToastOnParam />
      </Suspense>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <FadeIn className="card relative h-fit overflow-hidden">
        <div className="bg-brand-gradient h-24" aria-hidden="true" />
        <div className="px-5 pb-6 sm:px-6">
          <span className="-mt-10 flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-2xl font-semibold text-brand-600 shadow-xl ring-4 ring-white">
            {(session?.user?.name ?? "U").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
          </span>
          <h2 className="section-title mt-4 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-brand-500" aria-hidden="true" />
            {t("settings.profile")}
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3.5 py-2.5">
              <dt className="text-slate-500">{t("settings.name")}</dt>
              <dd className="truncate font-medium text-slate-900">{session?.user?.name ?? "-"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3.5 py-2.5">
              <dt className="text-slate-500">{t("settings.email")}</dt>
              <dd className="truncate font-medium text-slate-900">{session?.user?.email ?? "-"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3.5 py-2.5">
              <dt className="text-slate-500">{t("settings.role")}</dt>
              <dd>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-600/15 ring-inset">
                  {role ? t(`roles.${role}`) : "-"}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </FadeIn>

      <FadeIn delay={0.08} className="card p-5 sm:p-8 xl:col-span-2">
        <h2 className="section-title mb-6 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Building2 className="h-4 w-4" aria-hidden="true" />
          </span>
          {t("settings.company")}
        </h2>
        <form action={updateCompanyProfile} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t("settings.companyName")}>
            <input name="nom" defaultValue={companyProfile?.nom ?? ""} required className="input-lg" />
          </Field>
          <Field label={t("settings.taxId")}>
            <input
              name="matriculeFiscal"
              defaultValue={companyProfile?.matriculeFiscal ?? ""}
              className="input-lg"
            />
          </Field>
          <Field label={t("settings.email")}>
            <input
              type="email"
              name="email"
              defaultValue={companyProfile?.email ?? ""}
              className="input-lg"
            />
          </Field>
          <Field label={t("settings.phone")}>
            <input name="telephone" defaultValue={companyProfile?.telephone ?? ""} className="input-lg" />
          </Field>
          <Field label={t("settings.address")}>
            <input name="adresse" defaultValue={companyProfile?.adresse ?? ""} className="input-lg" />
          </Field>
          <Field label={t("settings.city")}>
            <input name="ville" defaultValue={companyProfile?.ville ?? ""} className="input-lg" />
          </Field>
          <Field label={t("settings.postalCode")}>
            <input name="codePostal" defaultValue={companyProfile?.codePostal ?? ""} className="input-lg" />
          </Field>
          <Field label={t("settings.country")}>
            <input name="pays" defaultValue={companyProfile?.pays ?? "Tunisie"} className="input-lg" />
          </Field>
          <Field label={t("settings.currency")}>
            <input name="devise" defaultValue={companyProfile?.devise ?? "TND"} className="input-lg" />
          </Field>
          <Field label={t("settings.stampDutyRate")}>
            <input
              type="number"
              step="0.001"
              name="tauxTimbreFiscal"
              defaultValue={companyProfile ? Number(companyProfile.tauxTimbreFiscal) : 1}
              className="input-lg"
            />
          </Field>
          <div className="flex justify-end border-t border-slate-100 pt-6 sm:col-span-2">
            <SubmitButton label={t("common.save")} />
          </div>
        </form>
      </FadeIn>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
