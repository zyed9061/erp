"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RowAction } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { useLocale } from "@/i18n/client";
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
  const { t } = useLocale();
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
          showError(t("common.error"));
        }
      });
    },
    [startTransition, showSuccess, showError, router, t],
  );

  const actionsFor = useCallback(
    (row: DevisActionRow): RowAction[] => {
      const actions: RowAction[] = [
        { label: t("common.view"), onSelect: () => router.push(`/devis/${row.id}`) },
        {
          label: t("common.duplicate"),
          onSelect: () =>
            runAction(
              duplicateDevis(row.id),
              t("quotes.toastDuplicated", { number: row.numero }),
              (result) => router.push(`/devis/${(result as { id: string }).id}`),
            ),
        },
        {
          label: t("common.downloadPdf"),
          onSelect: () => window.open(`/devis/${row.id}/pdf`, "_blank"),
        },
        {
          label: t("common.sendByEmail"),
          onSelect: () =>
            startTransition(async () => {
              const result = await sendDocumentByEmail({
                type: "devis",
                id: row.id,
                numero: row.numero,
                clientEmail: row.clientEmail,
              });
              const message = t(`notifications.${result.messageKey}`, result.vars);
              if (result.success) showSuccess(message);
              else showError(message);
            }),
        },
      ];

      if (row.statut === "BROUILLON") {
        actions.push({
          label: t("quotes.actionMarkSent"),
          onSelect: () =>
            runAction(
              updateDevisStatut(row.id, "ENVOYE"),
              t("quotes.toastMarkedSent", { number: row.numero }),
            ),
        });
      }
      if (row.statut === "ENVOYE") {
        actions.push(
          {
            label: t("quotes.actionMarkAccepted"),
            onSelect: () =>
              runAction(
                updateDevisStatut(row.id, "ACCEPTE"),
                t("quotes.toastMarkedAccepted", { number: row.numero }),
              ),
          },
          {
            label: t("quotes.actionMarkRefused"),
            onSelect: () =>
              runAction(
                updateDevisStatut(row.id, "REFUSE"),
                t("quotes.toastMarkedRefused", { number: row.numero }),
              ),
          },
        );
      }
      if (row.statut === "ACCEPTE" && !row.hasFacture) {
        actions.push({
          label: t("quotes.actionConvert"),
          onSelect: () =>
            runAction(
              convertirDevisEnFacture(row.id),
              t("quotes.toastConverted", { number: row.numero }),
              (result) => router.push(`/factures/${(result as { id: string }).id}`),
            ),
        });
      }

      return actions;
    },
    [router, runAction, showSuccess, showError, t],
  );

  return { actionsFor };
}
