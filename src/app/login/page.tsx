import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getT } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

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

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="absolute end-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-neutral-900">{t("nav.brand")}</h1>
        <p className="mb-6 text-sm text-neutral-500">{t("login.subtitle")}</p>

        {params.error && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("login.invalidCredentials")}
          </p>
        )}

        <form action={authenticate} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-neutral-700">
              {t("login.email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-neutral-700">
              {t("login.password")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            {t("login.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
