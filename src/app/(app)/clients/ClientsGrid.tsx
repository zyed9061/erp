"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataGrid } from "@/components/datagrid/DataGrid";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useLocale } from "@/i18n/client";
import { deactivateClient, activateClient } from "@/lib/actions/clients";
import { buildClientColumns, buildClientFilterFields, type ClientRow } from "./columns";

export function ClientsGrid({ data, userId }: { data: ClientRow[]; userId?: string }) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [archiveTarget, setArchiveTarget] = useState<ClientRow | null>(null);

  function handleArchive() {
    if (!archiveTarget) return;
    const target = archiveTarget;
    startTransition(async () => {
      try {
        if (target.actif) {
          await deactivateClient(target.id);
          showSuccess(t("clients.toastArchived", { name: target.nom }));
        } else {
          await activateClient(target.id);
          showSuccess(t("clients.toastReactivated", { name: target.nom }));
        }
        setArchiveTarget(null);
        router.refresh();
      } catch {
        showError(t("common.error"));
      }
    });
  }

  const columnDefs = useMemo(
    () =>
      buildClientColumns(t, locale, (row) => [
        { label: t("clients.actionViewProfile"), onSelect: () => router.push(`/clients/${row.id}`) },
        { label: t("common.edit"), onSelect: () => router.push(`/clients/${row.id}`) },
        {
          label: t("clients.actionCreateQuote"),
          onSelect: () => router.push(`/devis/new?clientId=${row.id}`),
        },
        {
          label: t("clients.actionCreateInvoice"),
          onSelect: () => router.push(`/factures/new?clientId=${row.id}`),
        },
        {
          label: t(row.actif ? "common.archive" : "common.reactivate"),
          destructive: row.actif,
          onSelect: () => setArchiveTarget(row),
        },
      ]),
    [router, t, locale],
  );

  const filterFields = useMemo(() => buildClientFilterFields(t), [t]);

  return (
    <>
      <DataGrid<ClientRow>
        moduleKey="clients"
        userId={userId}
        columnDefs={columnDefs}
        rowData={data}
        filterFields={filterFields}
        quickSearchPlaceholder={t("clients.searchPlaceholder")}
        onRefresh={() => router.refresh()}
        onRowClicked={(row) => router.push(`/clients/${row.id}`)}
        emptyTitle={t("clients.emptyTitle")}
        emptyDescription={t("clients.emptyDescription")}
        headerActions={
          <Link
            href="/clients/new"
            className="btn-primary h-10"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("clients.newClient")}
          </Link>
        }
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title={t(archiveTarget?.actif ? "clients.archiveConfirmTitle" : "clients.reactivateConfirmTitle")}
        description={t(
          archiveTarget?.actif ? "clients.archiveConfirmDescription" : "clients.reactivateConfirmDescription",
          { name: archiveTarget?.nom ?? "" },
        )}
        destructive={Boolean(archiveTarget?.actif)}
        pending={isPending}
        confirmLabel={t(archiveTarget?.actif ? "common.archive" : "common.reactivate")}
        onConfirm={handleArchive}
        onCancel={() => setArchiveTarget(null)}
      />
    </>
  );
}
