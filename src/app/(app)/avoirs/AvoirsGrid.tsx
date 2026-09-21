"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataGrid } from "@/components/datagrid/DataGrid";
import { useToast } from "@/components/ui/Toast";
import { updateAvoirStatut } from "@/lib/actions/avoirs";
import { buildAvoirColumns, AVOIR_FILTER_FIELDS, type AvoirRow } from "./columns";

export function AvoirsGrid({ data, userId }: { data: AvoirRow[]; userId?: string }) {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [, startTransition] = useTransition();

  const runAction = useCallback(
    (promise: Promise<unknown>, successMessage: string) => {
      startTransition(async () => {
        try {
          await promise;
          showSuccess(successMessage);
          router.refresh();
        } catch {
          showError("Une erreur est survenue.");
        }
      });
    },
    [startTransition, showSuccess, showError, router],
  );

  const columnDefs = useMemo(
    () =>
      buildAvoirColumns((row) => {
        const actions = [
          { label: "Voir", onSelect: () => router.push(`/avoirs/${row.id}`) },
          {
            label: "Telecharger le PDF",
            onSelect: () => window.open(`/avoirs/${row.id}/pdf`, "_blank"),
          },
        ];

        if (row.statut === "EMIS") {
          actions.push(
            {
              label: "Marquer comme applique",
              onSelect: () =>
                runAction(updateAvoirStatut(row.id, "APPLIQUE"), `${row.numero} marque comme applique.`),
            },
            {
              label: "Marquer comme rembourse",
              onSelect: () =>
                runAction(
                  updateAvoirStatut(row.id, "REMBOURSE"),
                  `${row.numero} marque comme rembourse.`,
                ),
            },
          );
        }

        return actions;
      }),
    [router, runAction],
  );

  return (
    <DataGrid<AvoirRow>
      moduleKey="avoirs"
      userId={userId}
      columnDefs={columnDefs}
      rowData={data}
      filterFields={AVOIR_FILTER_FIELDS}
      quickSearchPlaceholder="Rechercher un avoir..."
      onRefresh={() => router.refresh()}
      onRowClicked={(row) => router.push(`/avoirs/${row.id}`)}
      emptyTitle="Aucun avoir"
      emptyDescription="Un avoir se cree depuis une facture existante."
    />
  );
}
