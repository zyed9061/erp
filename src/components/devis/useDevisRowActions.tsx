"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RowAction } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { updateDevisStatut, convertirDevisEnFacture, duplicateDevis } from "@/lib/actions/devis";
import { sendDocumentByEmail } from "@/lib/services/notifications";

export type DevisActionRow = {
  id: string;
  numero: string;
  clientEmail: string | null;
  statut: string;
  hasFacture: boolean;
};

/** Actions de ligne des devis (menu "..."). */
export function useDevisRowActions() {
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

  const actionsFor = useCallback(
    (row: DevisActionRow): RowAction[] => {
      const actions: RowAction[] = [
        { label: "Voir", onSelect: () => router.push(`/devis/${row.id}`) },
        {
          label: "Dupliquer",
          onSelect: () =>
            runAction(duplicateDevis(row.id), `${row.numero} a ete duplique.`, (result) =>
              router.push(`/devis/${(result as { id: string }).id}`),
            ),
        },
        {
          label: "Telecharger le PDF",
          onSelect: () => window.open(`/devis/${row.id}/pdf`, "_blank"),
        },
        {
          label: "Envoyer par email",
          onSelect: () =>
            startTransition(async () => {
              const result = await sendDocumentByEmail({
                type: "devis",
                id: row.id,
                numero: row.numero,
                clientEmail: row.clientEmail,
              });
              if (result.success) showSuccess(result.message);
              else showError(result.message);
            }),
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
            runAction(convertirDevisEnFacture(row.id), `${row.numero} converti en facture.`, (result) =>
              router.push(`/factures/${(result as { id: string }).id}`),
            ),
        });
      }

      return actions;
    },
    [router, runAction, showSuccess, showError],
  );

  return { actionsFor };
}
