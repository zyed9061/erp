import Link from "next/link";
import { QUOTE_STATUSES } from "@/db/schema";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { todayTunis } from "@/lib/dates";
import { listQuotes } from "@/lib/invoicing/quotes";
import { formatTnd } from "@/lib/money";
import { Flash, PageHeader, Pagination } from "@/components/ui";
import { QUOTE_LABELS } from "./labels";
import { Badge } from "@/components/ui";
import { QuoteBadge } from "@/components/status-badges";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeZone: "UTC" });

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; ok?: string; error?: string }>;
}) {
  const user = await requirePermission("quotes:read");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status = QUOTE_STATUSES.find((s) => s === sp.status);
  const { rows, total, pageSize } = await listQuotes(db, { q: sp.q, status, page });
  const today = todayTunis();
  const qs = (p: number) =>
    `/devis?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(status ? { status } : {}), page: String(p) })}`;

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Devis"
        action={can(user.role, "quotes:write") ? { href: "/devis/nouveau", label: "Nouveau devis" } : undefined}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form className="flex flex-wrap gap-2 items-center">
        <input className="input !w-64" name="q" defaultValue={sp.q} placeholder="Numéro, client, référence" />
        <select className="input !w-auto" name="status" defaultValue={status ?? ""}>
          <option value="">Tous les statuts</option>
          {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{QUOTE_LABELS[s]}</option>)}
        </select>
        <button className="btn btn-ghost">Filtrer</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Numéro</th><th className="p-3">Client</th><th className="p-3">Date</th>
              <th className="p-3">Validité</th><th className="p-3 text-right">Total TTC</th><th className="p-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ quote: q, customerName }) => {
              const expired = q.status === "sent" && !!q.validUntil && q.validUntil < today;
              return (
                <tr key={q.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3 font-mono whitespace-nowrap"><Link className="underline" href={`/devis/${q.id}`}>{q.number ?? "Brouillon"}</Link></td>
                  <td className="p-3">{customerName}</td>
                  <td className="p-3 whitespace-nowrap">{dateFmt.format(new Date(`${q.issueDate}T00:00:00Z`))}</td>
                  <td className="p-3 whitespace-nowrap">{q.validUntil ? dateFmt.format(new Date(`${q.validUntil}T00:00:00Z`)) : "—"}</td>
                  <td className="p-3 text-right whitespace-nowrap">{formatTnd(q.totalTtc)}</td>
                  <td className="p-3"><QuoteBadge status={q.status} />{expired && <span className="ml-2"><Badge tone="bad">Expiré</Badge></span>}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td className="p-3" colSpan={6} style={{ color: "var(--muted)" }}>Aucun devis.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} href={qs} />
    </div>
  );
}
