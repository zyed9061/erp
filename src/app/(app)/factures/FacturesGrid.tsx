"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataGrid } from "@/components/datagrid/DataGrid";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { RowAction } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { useLocale } from "@/i18n/client";
import { updateFactureStatut, duplicateFacture } from "@/lib/actions/factures";
import { sendDocumentByEmail, sendPaymentReminder } from "@/lib/services/notifications";
import { buildFactureColumns, buildFactureFilterFields, type FactureRow } from "./columns";

export function FacturesGrid({ data, userId }: { data: FactureRow[]; userId?: string }) {
  const router = useRouter();
  const { t, locale } = useLocale();
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

  const columnDefs = useMemo(
    () =>
      buildFactureColumns(t, locale, (row) => {
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
            onSelect: () => {
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
              });
            },
          },
          { label: t("invoices.actionCreateCreditNote"), onSelect: () => router.push(`/avoirs/new?factureId=${row.id}`) },
        ];

        if (row.resteAPayer > 0 && row.statut !== "ANNULEE") {
          actions.push({
            label: t("invoices.actionRecordPayment"),
            onSelect: () => router.push(`/factures/${row.id}`),
          });
        }

        if (row.statut === "EN_RETARD" || row.statut === "PARTIELLEMENT_PAYEE") {
          actions.push({
            label: t("invoices.actionSendReminder"),
            onSelect: () => {
              startTransition(async () => {
                const result = await sendPaymentReminder({
                  factureId: row.id,
                  numero: row.numero,
                  clientEmail: row.clientEmail,
                });
                const message = t(`notifications.${result.messageKey}`, result.vars);
                if (result.success) showSuccess(message);
                else showError(message);
              });
            },
          });
        }

        if (row.statut === "BROUILLON") {
          actions.push({
            label: t("invoices.actionMarkSent"),
            onSelect: () =>
              runAction(updateFactureStatut(row.id, "ENVOYEE"), t("invoices.toastMarkedSent", { number: row.numero })),
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
      }),
    [router, runAction, showSuccess, showError, t, locale],
  );

  const filterFields = useMemo(() => buildFactureFilterFields(t), [t]);

  return (
    <>
      <DataGrid<FactureRow>
        moduleKey="factures"
        userId={userId}
        columnDefs={columnDefs}
        rowData={data}
        filterFields={filterFields}
        quickSearchPlaceholder={t("invoices.searchPlaceholder")}
        onRefresh={() => router.refresh()}
        onRowClicked={(row) => router.push(`/factures/${row.id}`)}
        emptyTitle={t("invoices.emptyTitle")}
        emptyDescription={t("invoices.emptyDescription")}
        headerActions={
          <Link
            href="/factures/new"
            className="btn-primary h-10"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("invoices.newInvoice")}
          </Link>
        }
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title={t("invoices.cancelConfirmTitle")}
        description={t("invoices.cancelConfirmDescription", { number: cancelTarget?.numero ?? "" })}
        confirmLabel={t("invoices.cancelConfirmButton")}
        pending={cancelPending}
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </>
  );
}
