import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;

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
    <div className="relative flex min-h-screen items-center justify-center bg-linear-to-br from-brand-soft via-neutral-50 to-accent-soft px-6">
      <ThemeToggle className="absolute top-4 right-4 bg-surface" />
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-neutral-200 bg-surface p-8 shadow-lg shadow-brand/10">
        <div className="-mx-8 -mt-8 mb-6 h-1.5 bg-linear-to-r from-brand via-accent to-pop" />
        <h1 className="mb-1 text-xl font-semibold text-neutral-900">Facturation</h1>
        <p className="mb-6 text-sm text-neutral-500">Connectez-vous a votre compte</p>

        {params.error && (
          <p className="mb-4 rounded bg-danger-soft px-3 py-2 text-sm text-danger">
            Identifiants incorrects.
          </p>
        )}

        <form action={authenticate} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="input"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-neutral-700">
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="input"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
