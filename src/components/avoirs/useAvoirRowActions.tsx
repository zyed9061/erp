"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RowAction } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { updateAvoirStatut } from "@/lib/actions/avoirs";

export type AvoirActionRow = { id: string; numero: string; statut: string };

/** Actions de ligne des avoirs (menu "..."). */
export function useAvoirRowActions() {
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

  const actionsFor = useCallback(
    (row: AvoirActionRow): RowAction[] => {
      const actions: RowAction[] = [
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
              runAction(updateAvoirStatut(row.id, "REMBOURSE"), `${row.numero} marque comme rembourse.`),
          },
        );
      }

      return actions;
    },
    [router, runAction],
  );

  return { actionsFor };
}
