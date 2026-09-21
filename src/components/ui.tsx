import Link from "next/link";

export function Field({
  label, children, className = "", hint,
}: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-sm">{label}</span>
      {children}
      {hint && <span className="block text-xs" style={{ color: "var(--muted)" }}>{hint}</span>}
    </label>
  );
}

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return error ? (
    <p role="alert" className="card p-3 text-sm" style={{ color: "var(--danger)" }}>{error}</p>
  ) : (
    <p role="status" className="card p-3 text-sm">{ok}</p>
  );
}

export function PageHeader({
  title, action,
}: { title: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {action && <Link href={action.href} className="btn">{action.label}</Link>}
    </div>
  );
}

export function Pagination({
  page, pageSize, total, href,
}: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      {page > 1 && <Link className="btn btn-ghost" href={href(page - 1)}>Précédent</Link>}
      <span style={{ color: "var(--muted)" }}>Page {page} / {pages}</span>
      {page < pages && <Link className="btn btn-ghost" href={href(page + 1)}>Suivant</Link>}
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className="text-xs rounded-full px-2 py-0.5 border" style={{ borderColor: "var(--border)", color: active ? "inherit" : "var(--danger)" }}>
      {active ? "Actif" : "Inactif"}
    </span>
  );
}

export type Tone = "ok" | "warn" | "bad" | "info" | "violet" | "neutral";

/** Pastille d'état colorée (jamais la couleur seule : le libellé est toujours écrit). */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
