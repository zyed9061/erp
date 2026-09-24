import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getT } from "@/i18n/server";
import { BrainCircuit, FileCheck2, Languages, Lock, Mail, Receipt } from "lucide-react";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { FadeIn, Shake, Stagger, StaggerItem } from "@/components/motion/Motion";
import { SubmitButton } from "@/components/ui/FormActions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const [params, t] = await Promise.all([searchParams, getT()]);

  async function authenticate(formData: FormData) {
    "use server";

    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: params.callbackUrl || "/",
      });
    } catch (error) {
      if (error instanceof AuthError) {
        redirect(`/login?error=1${params.callbackUrl ? `&callbackUrl=${params.callbackUrl}` : ""}`);
      }
      throw error;
    }
  }

  const features = [
    { icon: FileCheck2, label: t("login.featureInvoices") },
    { icon: BrainCircuit, label: t("login.featureInsights") },
    { icon: Languages, label: t("login.featureLanguages") },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand panel (desktop). */}
      <div className="bg-brand-gradient relative hidden w-1/2 overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -start-24 -top-24 h-96 w-96 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute -end-20 bottom-0 h-96 w-96 rounded-full bg-fuchsia-400/30 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.07)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        </div>

        <FadeIn className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur-md">
            <Receipt className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight">{t("nav.brand")}</span>
        </FadeIn>

        <div className="relative max-w-lg">
          <FadeIn delay={0.1}>
            <h2 className="text-4xl leading-tight font-semibold tracking-tight xl:text-5xl">{t("login.heroTitle")}</h2>
            <p className="mt-5 text-lg text-white/80">{t("login.heroSubtitle")}</p>
          </FadeIn>
          <Stagger className="mt-10 space-y-3">
            {features.map(({ icon: Icon, label }) => (
              <StaggerItem
                key={label}
                className="flex items-center gap-3.5 rounded-2xl bg-white/10 px-4 py-3.5 ring-1 ring-white/20 backdrop-blur-md"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium">{label}</span>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} {t("nav.brand")}</p>
      </div>

      {/* Sign-in form. */}
      <div className="relative flex flex-1 flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(40rem_18rem_at_50%_-6rem,rgb(99_102_241/0.14),transparent)] lg:hidden"
        />
        <div className="relative flex items-center justify-between p-4 sm:p-6">
          <span className="flex items-center gap-2.5 lg:invisible">
            <span className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg shadow-brand-500/30">
              <Receipt className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="font-semibold tracking-tight text-slate-900">{t("nav.brand")}</span>
          </span>
          <LanguageSwitcher />
        </div>

        <div className="relative flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
          <FadeIn delay={0.05} className="w-full max-w-sm">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{t("login.welcome")}</h1>
            <p className="mt-2 text-sm text-slate-500">{t("login.subtitle")}</p>

            {params.error && (
              <Shake
                role="alert"
                className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200"
              >
                {t("login.invalidCredentials")}
              </Shake>
            )}

            <form action={authenticate} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  {t("login.email")}
                </label>
                <div className="group relative">
                  <Mail
                    className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand-500"
                    aria-hidden="true"
                  />
                  <input id="email" name="email" type="email" autoComplete="email" required className="input-lg h-12 ps-10" />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  {t("login.password")}
                </label>
                <div className="group relative">
                  <Lock
                    className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand-500"
                    aria-hidden="true"
                  />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="input-lg h-12 ps-10"
                  />
                </div>
              </div>
              <SubmitButton
                label={t("login.submit")}
                pendingLabel={t("login.submitting")}
                icon={false}
                className="h-12! w-full text-[15px]"
              />
            </form>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
