"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataGrid } from "@/components/datagrid/DataGrid";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useLocale } from "@/i18n/client";
import { deactivateProduit, activateProduit } from "@/lib/actions/produits";
import { buildProduitColumns, buildProduitFilterFields, type ProduitRow } from "./columns";

export function ProduitsGrid({ data, userId }: { data: ProduitRow[]; userId?: string }) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [toggleTarget, setToggleTarget] = useState<ProduitRow | null>(null);

  function handleToggle() {
    if (!toggleTarget) return;
    const target = toggleTarget;
    startTransition(async () => {
      try {
        if (target.actif) {
          await deactivateProduit(target.id);
          showSuccess(t("products.toastDeactivated", { name: target.designation }));
        } else {
          await activateProduit(target.id);
          showSuccess(t("products.toastActivated", { name: target.designation }));
        }
        setToggleTarget(null);
        router.refresh();
      } catch {
        showError(t("common.error"));
      }
    });
  }

  const columnDefs = useMemo(
    () =>
      buildProduitColumns(t, locale, (row) => [
        { label: t("common.edit"), onSelect: () => router.push(`/produits/${row.id}`) },
        {
          label: t(row.actif ? "common.deactivate" : "common.activate"),
          destructive: row.actif,
          onSelect: () => setToggleTarget(row),
        },
      ]),
    [router, t, locale],
  );

  const filterFields = useMemo(() => buildProduitFilterFields(t, data), [t, data]);

  return (
    <>
      <DataGrid<ProduitRow>
        moduleKey="produits"
        userId={userId}
        columnDefs={columnDefs}
        rowData={data}
        filterFields={filterFields}
        quickSearchPlaceholder={t("products.searchPlaceholder")}
        onRefresh={() => router.refresh()}
        onRowClicked={(row) => router.push(`/produits/${row.id}`)}
        emptyTitle={t("products.emptyTitle")}
        emptyDescription={t("products.emptyDescription")}
        headerActions={
          <Link
            href="/produits/new"
            className="flex items-center gap-1.5 rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("products.newProduct")}
          </Link>
        }
      />

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        title={t(toggleTarget?.actif ? "products.deactivateConfirmTitle" : "products.activateConfirmTitle")}
        description={t(
          toggleTarget?.actif ? "products.deactivateConfirmDescription" : "products.activateConfirmDescription",
          { name: toggleTarget?.designation ?? "" },
        )}
        destructive={Boolean(toggleTarget?.actif)}
        pending={isPending}
        confirmLabel={t(toggleTarget?.actif ? "common.deactivate" : "common.activate")}
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </>
  );
}
