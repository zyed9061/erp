"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataGrid } from "@/components/datagrid/DataGrid";
import { useToast } from "@/components/ui/Toast";
import { useLocale } from "@/i18n/client";
import { updateAvoirStatut } from "@/lib/actions/avoirs";
import { buildAvoirColumns, buildAvoirFilterFields, type AvoirRow } from "./columns";

export function AvoirsGrid({ data, userId }: { data: AvoirRow[]; userId?: string }) {
  const router = useRouter();
  const { t, locale } = useLocale();
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

  const columnDefs = useMemo(
    () =>
      buildAvoirColumns(t, locale, (row) => {
        const actions = [
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
                runAction(updateAvoirStatut(row.id, "APPLIQUE"), t("creditNotes.toastMarkedApplied", { number: row.numero })),
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
      }),
    [router, runAction, t, locale],
  );

  const filterFields = useMemo(() => buildAvoirFilterFields(t), [t]);

  return (
    <DataGrid<AvoirRow>
      moduleKey="avoirs"
      userId={userId}
      columnDefs={columnDefs}
      rowData={data}
      filterFields={filterFields}
      quickSearchPlaceholder={t("creditNotes.searchPlaceholder")}
      onRefresh={() => router.refresh()}
      onRowClicked={(row) => router.push(`/avoirs/${row.id}`)}
      emptyTitle={t("creditNotes.emptyTitle")}
      emptyDescription={t("creditNotes.emptyDescription")}
    />
  );
}
