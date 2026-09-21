import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { isDemoMode } from "@/lib/demo/mode";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {isDemoMode() && (
        <aside className="max-w-sm mx-auto px-4 pb-8 text-sm">
          <div className="card p-4 space-y-2">
            <p className="font-medium">Comptes de démonstration</p>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <span className="font-mono">{a.email}</span> · <span className="font-mono">{a.password}</span>
                  <span style={{ color: "var(--muted)" }}> ({a.role})</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </>
  );
}
