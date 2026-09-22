"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RowAction } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { useLocale } from "@/i18n/client";
import { updateAvoirStatut } from "@/lib/actions/avoirs";

export type AvoirActionRow = { id: string; numero: string; statut: string };

/** Actions de ligne des avoirs (menu "..."). */
export function useAvoirRowActions() {
  const router = useRouter();
  const { t } = useLocale();
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
          showError(t("common.error"));
        }
      });
    },
    [startTransition, showSuccess, showError, router, t],
  );

  const actionsFor = useCallback(
    (row: AvoirActionRow): RowAction[] => {
      const actions: RowAction[] = [
        { label: t("common.view"), onSelect: () => router.push(`/avoirs/${row.id}`) },
        {
          label: t("common.downloadPdf"),
          onSelect: () => window.open(`/avoirs/${row.id}/pdf`, "_blank"),
        },
      ];

      if (row.statut === "EMIS") {
        actions.push(
          {
            label: t("creditNotes.actionMarkApplied"),
            onSelect: () =>
              runAction(
                updateAvoirStatut(row.id, "APPLIQUE"),
                t("creditNotes.toastMarkedApplied", { number: row.numero }),
              ),
          },
          {
            label: t("creditNotes.actionMarkRefunded"),
            onSelect: () =>
              runAction(
                updateAvoirStatut(row.id, "REMBOURSE"),
                t("creditNotes.toastMarkedRefunded", { number: row.numero }),
              ),
          },
        );
      }

      return actions;
    },
    [router, runAction, t],
  );

  return { actionsFor };
}
