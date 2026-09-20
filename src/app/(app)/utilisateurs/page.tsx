import { db } from "@/db";
import { ROLES } from "@/db/schema";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listUsers } from "@/lib/users";
import { createUserAction, updateUserAction } from "./actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-TN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Africa/Tunis",
});

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const me = await requirePermission("users:manage");
  const { ok, error } = await searchParams;
  const users = await listUsers(db);

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-semibold">Utilisateurs</h1>

      {ok && <p role="status" className="card p-3 text-sm">{ok}</p>}
      {error && <p role="alert" className="card p-3 text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

      <section className="card p-4">
        <h2 className="font-medium mb-3">Nouvel utilisateur</h2>
        <form action={createUserAction} className="grid gap-3 sm:grid-cols-2">
          <input className="input" name="name" placeholder="Nom complet" required />
          <input className="input" name="email" type="email" placeholder="E-mail" required />
          <select className="input" name="role" defaultValue="lecture_seule">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <input
            className="input" name="password" type="password" autoComplete="new-password"
            placeholder={`Mot de passe (${MIN_PASSWORD_LENGTH} caractères min.)`} minLength={MIN_PASSWORD_LENGTH} required
          />
          <div className="sm:col-span-2"><button className="btn">Créer</button></div>
        </form>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Utilisateur</th>
              <th className="p-3">Dernière connexion</th>
              <th className="p-3">Modifier</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <p className="font-medium">{u.name}{u.id === me.id && " (vous)"}</p>
                  <p style={{ color: "var(--muted)" }}>{u.email}</p>
                  {!u.isActive && <p style={{ color: "var(--danger)" }}>Désactivé</p>}
                </td>
                <td className="p-3 whitespace-nowrap">{u.lastLoginAt ? dateFmt.format(u.lastLoginAt) : "—"}</td>
                <td className="p-3">
                  <form action={updateUserAction} className="flex flex-wrap gap-2 items-center">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="isActive" value={String(u.isActive)} />
                    <select className="input !w-auto" name="role" defaultValue={u.role}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    <input
                      className="input !w-44" name="password" type="password" autoComplete="new-password"
                      placeholder="Nouveau mot de passe" minLength={MIN_PASSWORD_LENGTH}
                    />
                    <button className="btn btn-ghost">Enregistrer</button>
                  </form>
                  <form action={updateUserAction} className="mt-2">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="role" value={u.role} />
                    <input type="hidden" name="isActive" value={String(!u.isActive)} />
                    <button className="btn btn-ghost" style={u.isActive ? { color: "var(--danger)" } : undefined}>
                      {u.isActive ? "Désactiver" : "Réactiver"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
