import { prisma } from "@/lib/prisma";
import { formatMontant } from "@/lib/format";

export default async function DashboardPage() {
  const now = new Date();
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);

  const [caduMois, facturesImpayees, devisEnAttente, clientsActifs] = await Promise.all([
    prisma.facture.aggregate({
      _sum: { totalTTC: true },
      where: { dateEmission: { gte: debutMois }, statut: { not: "ANNULEE" } },
    }),
    prisma.facture.findMany({
      where: { statut: { in: ["ENVOYEE", "PARTIELLEMENT_PAYEE", "EN_RETARD"] } },
      include: { client: true },
      orderBy: { dateEcheance: "asc" },
      take: 5,
    }),
    prisma.devis.count({ where: { statut: { in: ["BROUILLON", "ENVOYE"] } } }),
    prisma.client.count({ where: { actif: true } }),
  ]);

  const totalImpaye = facturesImpayees.reduce(
    (acc, f) => acc + (Number(f.totalTTC) - Number(f.montantPaye)),
    0,
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-neutral-900">Tableau de bord</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="CA du mois"
          value={formatMontant(Number(caduMois._sum.totalTTC ?? 0))}
          accent="border-t-brand"
        />
        <StatCard label="Impayes en cours" value={formatMontant(totalImpaye)} accent="border-t-accent" />
        <StatCard label="Devis en attente" value={String(devisEnAttente)} accent="border-t-pop" />
        <StatCard label="Clients actifs" value={String(clientsActifs)} accent="border-t-teal" />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-surface">
        <div className="border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-medium text-neutral-900">Factures a suivre</h2>
        </div>
        {facturesImpayees.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-500">Aucune facture en attente de paiement.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="px-5 py-2 font-normal">Numero</th>
                <th className="px-5 py-2 font-normal">Client</th>
                <th className="px-5 py-2 font-normal">Echeance</th>
                <th className="px-5 py-2 font-normal">Reste a payer</th>
              </tr>
            </thead>
            <tbody>
              {facturesImpayees.map((f) => (
                <tr key={f.id} className="border-t border-neutral-100">
                  <td className="px-5 py-2">
                    <a href={`/factures/${f.id}`} className="text-neutral-900 hover:underline">
                      {f.numero}
                    </a>
                  </td>
                  <td className="px-5 py-2">{f.client.nom}</td>
                  <td className="px-5 py-2">
                    {f.dateEcheance ? new Date(f.dateEcheance).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-5 py-2">
                    {formatMontant(Number(f.totalTTC) - Number(f.montantPaye))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={`rounded-lg border border-t-4 border-neutral-200 bg-surface p-4 shadow-sm ${accent}`}>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}
