import Link from "next/link";
import { PROJECT_STATUSES } from "@/db/schema";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatTnd } from "@/lib/money";
import { listProjects } from "@/lib/projects";
import { Flash, PageHeader, Pagination } from "@/components/ui";
import { PROJECT_LABELS } from "./labels";
import { ProjectBadge } from "@/components/status-badges";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; ok?: string; error?: string }>;
}) {
  const user = await requirePermission("projects:read");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status = PROJECT_STATUSES.find((s) => s === sp.status);
  const { rows, total, pageSize } = await listProjects(db, { q: sp.q, status, page });
  const qs = (p: number) => `/chantiers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(status ? { status } : {}), page: String(p) })}`;

  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader
        title="Chantiers"
        action={can(user.role, "projects:write") ? { href: "/chantiers/nouveau", label: "Nouveau chantier" } : undefined}
      />
      <Flash ok={sp.ok} error={sp.error} />
      <form className="flex flex-wrap gap-2 items-center">
        <input className="input !w-64" name="q" defaultValue={sp.q} placeholder="Nom du chantier ou client" />
        <select className="input !w-auto" name="status" defaultValue={status ?? ""}>
          <option value="">Tous les statuts</option>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_LABELS[s]}</option>)}
        </select>
        <button className="btn btn-ghost">Filtrer</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Chantier</th><th className="p-3">Client</th><th className="p-3 text-right">Marché HT</th>
              <th className="p-3 text-right">Situations</th><th className="p-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ project: p, customerName, contractHt, situations }) => (
              <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3"><Link className="underline" href={`/chantiers/${p.id}`}>{p.name}</Link></td>
                <td className="p-3">{customerName}</td>
                <td className="p-3 text-right whitespace-nowrap">{formatTnd(contractHt)}</td>
                <td className="p-3 text-right">{situations}</td>
                <td className="p-3"><ProjectBadge status={p.status} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="p-3" colSpan={5} style={{ color: "var(--muted)" }}>Aucun chantier.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} href={qs} />
    </div>
  );
}
