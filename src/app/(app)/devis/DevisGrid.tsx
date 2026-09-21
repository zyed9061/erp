"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataGrid } from "@/components/datagrid/DataGrid";
import { useToast } from "@/components/ui/Toast";
import { updateDevisStatut, convertirDevisEnFacture, duplicateDevis } from "@/lib/actions/devis";
import { sendDocumentByEmail } from "@/lib/services/notifications";
import { buildDevisColumns, DEVIS_FILTER_FIELDS, type DevisRow } from "./columns";

export function DevisGrid({ data, userId }: { data: DevisRow[]; userId?: string }) {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [, startTransition] = useTransition();

  const runAction = useCallback(
    (promise: Promise<unknown>, successMessage: string, onDone?: (result: unknown) => void) => {
      startTransition(async () => {
        try {
          const result = await promise;
          showSuccess(successMessage);
          if (onDone) onDone(result);
          else router.refresh();
        } catch {
          showError("Une erreur est survenue.");
        }
      });
    },
    [startTransition, showSuccess, showError, router],
  );

  const columnDefs = useMemo(
    () =>
      buildDevisColumns((row) => {
        const actions = [
          { label: "Voir", onSelect: () => router.push(`/devis/${row.id}`) },
          {
            label: "Dupliquer",
            onSelect: () =>
              runAction(
                duplicateDevis(row.id),
                `${row.numero} a ete duplique.`,
                (result) => router.push(`/devis/${(result as { id: string }).id}`),
              ),
          },
          {
            label: "Telecharger le PDF",
            onSelect: () => window.open(`/devis/${row.id}/pdf`, "_blank"),
          },
          {
            label: "Envoyer par email",
            onSelect: () => {
              startTransition(async () => {
                const result = await sendDocumentByEmail({
                  type: "devis",
                  id: row.id,
                  numero: row.numero,
                  clientEmail: row.clientEmail,
                });
                if (result.success) showSuccess(result.message);
                else showError(result.message);
              });
            },
          },
        ];

        if (row.statut === "BROUILLON") {
          actions.push({
            label: "Marquer comme envoye",
            onSelect: () =>
              runAction(updateDevisStatut(row.id, "ENVOYE"), `${row.numero} marque comme envoye.`),
          });
        }
        if (row.statut === "ENVOYE") {
          actions.push(
            {
              label: "Marquer comme accepte",
              onSelect: () =>
                runAction(updateDevisStatut(row.id, "ACCEPTE"), `${row.numero} marque comme accepte.`),
            },
            {
              label: "Marquer comme refuse",
              onSelect: () =>
                runAction(updateDevisStatut(row.id, "REFUSE"), `${row.numero} marque comme refuse.`),
            },
          );
        }
        if (row.statut === "ACCEPTE" && !row.hasFacture) {
          actions.push({
            label: "Convertir en facture",
            onSelect: () =>
              runAction(
                convertirDevisEnFacture(row.id),
                `${row.numero} converti en facture.`,
                (result) => router.push(`/factures/${(result as { id: string }).id}`),
              ),
          });
        }

        return actions;
      }),
    [router, runAction, showSuccess, showError],
  );

  return (
    <DataGrid<DevisRow>
      moduleKey="devis"
      userId={userId}
      columnDefs={columnDefs}
      rowData={data}
      filterFields={DEVIS_FILTER_FIELDS}
      quickSearchPlaceholder="Rechercher un devis..."
      onRefresh={() => router.refresh()}
      onRowClicked={(row) => router.push(`/devis/${row.id}`)}
      emptyTitle="Aucun devis"
      emptyDescription="Creez votre premier devis pour un client."
      headerActions={
        <Link
          href="/devis/new"
          className="flex items-center gap-1.5 rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau devis
        </Link>
      }
    />
  );
}
