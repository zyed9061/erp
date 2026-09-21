"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataGrid } from "@/components/datagrid/DataGrid";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { RowAction } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { updateFactureStatut, duplicateFacture } from "@/lib/actions/factures";
import { sendDocumentByEmail, sendPaymentReminder } from "@/lib/services/notifications";
import { buildFactureColumns, FACTURE_FILTER_FIELDS, type FactureRow } from "./columns";

export function FacturesGrid({ data, userId }: { data: FactureRow[]; userId?: string }) {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [, startTransition] = useTransition();
  const [cancelTarget, setCancelTarget] = useState<FactureRow | null>(null);
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

  const columnDefs = useMemo(
    () =>
      buildFactureColumns((row) => {
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
            onSelect: () => {
              startTransition(async () => {
                const result = await sendDocumentByEmail({
                  type: "facture",
                  id: row.id,
                  numero: row.numero,
                  clientEmail: row.clientEmail,
                });
                if (result.success) showSuccess(result.message);
                else showError(result.message);
              });
            },
          },
          { label: "Creer un avoir", onSelect: () => router.push(`/avoirs/new?factureId=${row.id}`) },
        ];

        if (row.resteAPayer > 0 && row.statut !== "ANNULEE") {
          actions.push({
            label: "Enregistrer un paiement",
            onSelect: () => router.push(`/factures/${row.id}`),
          });
        }

        if (row.statut === "EN_RETARD" || row.statut === "PARTIELLEMENT_PAYEE") {
          actions.push({
            label: "Envoyer un rappel",
            onSelect: () => {
              startTransition(async () => {
                const result = await sendPaymentReminder({
                  factureId: row.id,
                  numero: row.numero,
                  clientEmail: row.clientEmail,
                });
                if (result.success) showSuccess(result.message);
                else showError(result.message);
              });
            },
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
      }),
    [router, runAction, showSuccess, showError],
  );

  return (
    <>
      <DataGrid<FactureRow>
        moduleKey="factures"
        userId={userId}
        columnDefs={columnDefs}
        rowData={data}
        filterFields={FACTURE_FILTER_FIELDS}
        quickSearchPlaceholder="Rechercher une facture..."
        onRefresh={() => router.refresh()}
        onRowClicked={(row) => router.push(`/factures/${row.id}`)}
        emptyTitle="Aucune facture"
        emptyDescription="Creez votre premiere facture pour un client."
        headerActions={
          <Link
            href="/factures/new"
            className="flex items-center gap-1.5 rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle facture
          </Link>
        }
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Annuler cette facture ?"
        description={`La facture ${cancelTarget?.numero} sera marquee comme annulee. Cette action ne supprime pas les paiements deja enregistres.`}
        confirmLabel="Annuler la facture"
        pending={cancelPending}
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </>
  );
}
