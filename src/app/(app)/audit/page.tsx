import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { requirePermission } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const dateFmt = new Intl.DateTimeFormat("fr-TN", {
  dateStyle: "short", timeStyle: "medium", timeZone: "Africa/Tunis",
});

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission("audit:read");
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);

  const rows = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  const hasNext = rows.length > PAGE_SIZE;
  const entries = rows.slice(0, PAGE_SIZE);

  return (
    <div className="space-y-4 max-w-6xl">
      <h1 className="text-2xl font-semibold">Journal d&apos;audit</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Date</th>
              <th className="p-3">Utilisateur</th>
              <th className="p-3">Action</th>
              <th className="p-3">Entité</th>
              <th className="p-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 whitespace-nowrap">{dateFmt.format(e.occurredAt)}</td>
                <td className="p-3">{e.userEmail ?? "—"}</td>
                <td className="p-3 font-mono">{e.action}</td>
                <td className="p-3">{e.entity}{e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ""}</td>
                <td className="p-3">{e.ip ?? "—"}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td className="p-3" colSpan={5} style={{ color: "var(--muted)" }}>Aucune entrée.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn btn-ghost" href={`/audit?page=${page - 1}`}>Précédent</Link>}
        {hasNext && <Link className="btn btn-ghost" href={`/audit?page=${page + 1}`}>Suivant</Link>}
      </div>
    </div>
  );
}
