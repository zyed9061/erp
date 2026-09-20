import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    where: { actif: true },
    orderBy: { nom: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Clients</h1>
        <Link
          href="/clients/new"
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Nouveau client
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-normal">Nom</th>
              <th className="px-5 py-3 font-normal">Type</th>
              <th className="px-5 py-3 font-normal">Email</th>
              <th className="px-5 py-3 font-normal">Telephone</th>
              <th className="px-5 py-3 font-normal">Ville</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-t border-neutral-100">
                <td className="px-5 py-3">
                  <Link href={`/clients/${client.id}`} className="text-neutral-900 hover:underline">
                    {client.nom}
                  </Link>
                </td>
                <td className="px-5 py-3 text-neutral-600">
                  {client.type === "ENTREPRISE" ? "Entreprise" : "Particulier"}
                </td>
                <td className="px-5 py-3 text-neutral-600">{client.email || "—"}</td>
                <td className="px-5 py-3 text-neutral-600">{client.telephone || "—"}</td>
                <td className="px-5 py-3 text-neutral-600">{client.ville || "—"}</td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-neutral-500">
                  Aucun client pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
