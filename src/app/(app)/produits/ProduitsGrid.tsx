"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataGrid } from "@/components/datagrid/DataGrid";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { deactivateProduit, activateProduit } from "@/lib/actions/produits";
import { buildProduitColumns, buildProduitFilterFields, type ProduitRow } from "./columns";

export function ProduitsGrid({ data, userId }: { data: ProduitRow[]; userId?: string }) {
  const router = useRouter();
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
          showSuccess(`${target.designation} a ete desactive.`);
        } else {
          await activateProduit(target.id);
          showSuccess(`${target.designation} a ete active.`);
        }
        setToggleTarget(null);
        router.refresh();
      } catch {
        showError("Une erreur est survenue.");
      }
    });
  }

  const columnDefs = useMemo(
    () =>
      buildProduitColumns((row) => [
        { label: "Modifier", onSelect: () => router.push(`/produits/${row.id}`) },
        {
          label: row.actif ? "Desactiver" : "Activer",
          destructive: row.actif,
          onSelect: () => setToggleTarget(row),
        },
      ]),
    [router],
  );

  const filterFields = useMemo(() => buildProduitFilterFields(data), [data]);

  return (
    <>
      <DataGrid<ProduitRow>
        moduleKey="produits"
        userId={userId}
        columnDefs={columnDefs}
        rowData={data}
        filterFields={filterFields}
        quickSearchPlaceholder="Rechercher un produit ou service..."
        onRefresh={() => router.refresh()}
        onRowClicked={(row) => router.push(`/produits/${row.id}`)}
        emptyTitle="Aucun produit ou service"
        emptyDescription="Ajoutez votre premier produit ou service au catalogue."
        headerActions={
          <Link
            href="/produits/new"
            className="flex items-center gap-1.5 rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau produit
          </Link>
        }
      />

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        title={toggleTarget?.actif ? "Desactiver cet element ?" : "Activer cet element ?"}
        description={
          toggleTarget?.actif
            ? `${toggleTarget?.designation} ne sera plus propose dans les devis et factures.`
            : `${toggleTarget?.designation} sera de nouveau disponible.`
        }
        destructive={Boolean(toggleTarget?.actif)}
        pending={isPending}
        confirmLabel={toggleTarget?.actif ? "Desactiver" : "Activer"}
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </>
  );
}
