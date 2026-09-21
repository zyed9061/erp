"use client";

type Account = { email: string; password: string; role: string; label: string };

/** Comptes de DÉMONSTRATION : un clic remplit le formulaire de connexion (les mots de passe sont publics). */
export function DemoAccounts({ accounts }: { accounts: Account[] }) {
  const fill = (a: Account) => {
    const set = (name: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (input) input.value = value;
    };
    set("email", a.email);
    set("password", a.password);
    document.querySelector<HTMLButtonElement>("form button")?.focus();
  };

  return (
    <aside className="px-4 pb-10 text-sm">
      <div className="card p-5 space-y-3 max-w-sm mx-auto">
        <div>
          <p className="font-medium">Comptes de démonstration</p>
          <p style={{ color: "var(--muted)" }}>Cliquez sur un compte pour remplir le formulaire.</p>
        </div>
        <ul className="grid gap-2">
          {accounts.map((a) => (
            <li key={a.email}>
              <button type="button" onClick={() => fill(a)} className="btn btn-ghost w-full text-left flex items-center justify-between gap-3">
                <span className="font-medium">{a.label}</span>
                <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>{a.email}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs" style={{ color: "var(--muted)" }}>Mots de passe publics, valables uniquement pour cette démonstration.</p>
      </div>
    </aside>
  );
}
