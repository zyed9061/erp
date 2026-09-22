"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { RowAction } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { useLocale } from "@/i18n/client";
import { updateFactureStatut, duplicateFacture } from "@/lib/actions/factures";
import { sendDocumentByEmail, sendPaymentReminder } from "@/lib/services/notifications";

export type FactureActionRow = {
  id: string;
  numero: string;
  clientEmail: string | null;
  /** Statut affiche (retard derive inclus). */
  statut: string;
  reste: number;
};

/** Actions de ligne des factures (menu "...") et confirmation d'annulation. */
export function useFactureRowActions() {
  const router = useRouter();
  const { t } = useLocale();
  const { showSuccess, showError } = useToast();
  const [, startTransition] = useTransition();
  const [cancelTarget, setCancelTarget] = useState<FactureActionRow | null>(null);
  const [cancelPending, setCancelPending] = useState(false);

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

  function handleCancel() {
    if (!cancelTarget) return;
    const target = cancelTarget;
    setCancelPending(true);
    startTransition(async () => {
      try {
        await updateFactureStatut(target.id, "ANNULEE");
        showSuccess(t("invoices.toastCancelled", { number: target.numero }));
        setCancelTarget(null);
        router.refresh();
      } catch {
        showError(t("common.error"));
      } finally {
        setCancelPending(false);
      }
    });
  }

  const actionsFor = useCallback(
    (row: FactureActionRow): RowAction[] => {
      const actions: RowAction[] = [
        { label: t("common.view"), onSelect: () => router.push(`/factures/${row.id}`) },
        {
          label: t("common.duplicate"),
          onSelect: () =>
            startTransition(async () => {
              try {
                const result = await duplicateFacture(row.id);
                showSuccess(t("invoices.toastDuplicated", { number: row.numero }));
                router.push(`/factures/${result.id}`);
              } catch {
                showError(t("common.error"));
              }
            }),
        },
        {
          label: t("common.downloadPdf"),
          onSelect: () => window.open(`/factures/${row.id}/pdf`, "_blank"),
        },
        {
          label: t("common.sendByEmail"),
          onSelect: () =>
            startTransition(async () => {
              const result = await sendDocumentByEmail({
                type: "facture",
                id: row.id,
                numero: row.numero,
                clientEmail: row.clientEmail,
              });
              const message = t(`notifications.${result.messageKey}`, result.vars);
              if (result.success) showSuccess(message);
              else showError(message);
            }),
        },
        {
          label: t("invoices.actionCreateCreditNote"),
          onSelect: () => router.push(`/avoirs/new?factureId=${row.id}`),
        },
      ];

      if (row.reste > 0 && row.statut !== "ANNULEE") {
        actions.push({
          label: t("invoices.actionRecordPayment"),
          onSelect: () => router.push(`/factures/${row.id}`),
        });
      }

      if (row.statut === "EN_RETARD" || row.statut === "PARTIELLEMENT_PAYEE") {
        actions.push({
          label: t("invoices.actionSendReminder"),
          onSelect: () =>
            startTransition(async () => {
              const result = await sendPaymentReminder({
                factureId: row.id,
                numero: row.numero,
                clientEmail: row.clientEmail,
              });
              const message = t(`notifications.${result.messageKey}`, result.vars);
              if (result.success) showSuccess(message);
              else showError(message);
            }),
        });
      }

      if (row.statut === "BROUILLON") {
        actions.push({
          label: t("invoices.actionMarkSent"),
          onSelect: () =>
            runAction(
              updateFactureStatut(row.id, "ENVOYEE"),
              t("invoices.toastMarkedSent", { number: row.numero }),
            ),
        });
      }

      if (row.statut !== "ANNULEE" && row.statut !== "PAYEE") {
        actions.push({
          label: t("invoices.actionCancel"),
          destructive: true,
          onSelect: () => setCancelTarget(row),
        });
      }

      return actions;
    },
    [router, runAction, showSuccess, showError, t],
  );

  const dialogs = (
    <ConfirmDialog
      open={Boolean(cancelTarget)}
      title={t("invoices.cancelConfirmTitle")}
      description={t("invoices.cancelConfirmDescription", { number: cancelTarget?.numero ?? "" })}
      confirmLabel={t("invoices.cancelConfirmButton")}
      pending={cancelPending}
      onConfirm={handleCancel}
      onCancel={() => setCancelTarget(null)}
    />
  );

  return { actionsFor, dialogs };
}
