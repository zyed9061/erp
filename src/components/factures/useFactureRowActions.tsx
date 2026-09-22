"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { RowAction } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/Toast";
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
          showError("Une erreur est survenue.");
        }
      });
    },
    [startTransition, showSuccess, showError, router],
  );

  function handleCancel() {
    if (!cancelTarget) return;
    const target = cancelTarget;
    setCancelPending(true);
    startTransition(async () => {
      try {
        await updateFactureStatut(target.id, "ANNULEE");
        showSuccess(`${target.numero} a ete annulee.`);
        setCancelTarget(null);
        router.refresh();
      } catch {
        showError("Une erreur est survenue.");
      } finally {
        setCancelPending(false);
      }
    });
  }

  const actionsFor = useCallback(
    (row: FactureActionRow): RowAction[] => {
      const actions: RowAction[] = [
        { label: "Voir", onSelect: () => router.push(`/factures/${row.id}`) },
        {
          label: "Dupliquer",
          onSelect: () =>
            startTransition(async () => {
              try {
                const result = await duplicateFacture(row.id);
                showSuccess(`${row.numero} a ete dupliquee.`);
                router.push(`/factures/${result.id}`);
              } catch {
                showError("Une erreur est survenue.");
              }
            }),
        },
        {
          label: "Telecharger le PDF",
          onSelect: () => window.open(`/factures/${row.id}/pdf`, "_blank"),
        },
        {
          label: "Envoyer par email",
          onSelect: () =>
            startTransition(async () => {
              const result = await sendDocumentByEmail({
                type: "facture",
                id: row.id,
                numero: row.numero,
                clientEmail: row.clientEmail,
              });
              if (result.success) showSuccess(result.message);
              else showError(result.message);
            }),
        },
        { label: "Creer un avoir", onSelect: () => router.push(`/avoirs/new?factureId=${row.id}`) },
      ];

      if (row.reste > 0 && row.statut !== "ANNULEE") {
        actions.push({
          label: "Enregistrer un paiement",
          onSelect: () => router.push(`/factures/${row.id}`),
        });
      }

      if (row.statut === "EN_RETARD" || row.statut === "PARTIELLEMENT_PAYEE") {
        actions.push({
          label: "Envoyer un rappel",
          onSelect: () =>
            startTransition(async () => {
              const result = await sendPaymentReminder({
                factureId: row.id,
                numero: row.numero,
                clientEmail: row.clientEmail,
              });
              if (result.success) showSuccess(result.message);
              else showError(result.message);
            }),
        });
      }

      if (row.statut === "BROUILLON") {
        actions.push({
          label: "Marquer comme envoyee",
          onSelect: () =>
            runAction(updateFactureStatut(row.id, "ENVOYEE"), `${row.numero} marquee comme envoyee.`),
        });
      }

      if (row.statut !== "ANNULEE" && row.statut !== "PAYEE") {
        actions.push({
          label: "Annuler",
          destructive: true,
          onSelect: () => setCancelTarget(row),
        });
      }

      return actions;
    },
    [router, runAction, showSuccess, showError],
  );

  const dialogs = (
    <ConfirmDialog
      open={Boolean(cancelTarget)}
      title="Annuler cette facture ?"
      description={`La facture ${cancelTarget?.numero} sera marquee comme annulee. Cette action ne supprime pas les paiements deja enregistres.`}
      confirmLabel="Annuler la facture"
      pending={cancelPending}
      onConfirm={handleCancel}
      onCancel={() => setCancelTarget(null)}
    />
  );

  return { actionsFor, dialogs };
}
