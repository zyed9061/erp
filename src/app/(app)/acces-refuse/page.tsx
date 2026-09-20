import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="card p-6 max-w-md space-y-3">
      <h1 className="text-xl font-semibold">Accès refusé</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Votre rôle ne permet pas d&apos;accéder à cette page.
      </p>
      <Link className="btn btn-ghost inline-block" href="/">Retour au tableau de bord</Link>
    </div>
  );
}
