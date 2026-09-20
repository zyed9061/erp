import { ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">Bonjour, {user.name}</h1>
      <div className="card p-4">
        <p>
          Connecté en tant que <strong>{ROLE_LABELS[user.role]}</strong>.
        </p>
        <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
          Les modules clients, produits, factures et paiements seront ajoutés dans les prochaines phases.
        </p>
      </div>
    </div>
  );
}
