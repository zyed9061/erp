"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColDef } from "ag-grid-community";
import { MiniGrid } from "@/components/datagrid/MiniGrid";
import { StatutBadge } from "@/components/StatutBadge";
import { formatMontant, formatDate } from "@/lib/format";
import { useLocale } from "@/i18n/client";

export interface DashboardFactureRow {
  id: string;
  numero: string;
  clientNom: string;
  dateEcheance: string | null;
  resteAPayer: number;
  statut: string;
}

function useColumns(): ColDef<DashboardFactureRow>[] {
  const { t, locale } = useLocale();
  return useMemo(
    () => [
      {
        field: "numero",
        headerName: t("documents.columnNumber"),
        flex: 1,
        minWidth: 130,
        cellRenderer: (params: { data?: DashboardFactureRow }) =>
          params.data ? (
            <Link href={`/factures/${params.data.id}`} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
              {params.data.numero}
            </Link>
          ) : null,
      },
      { field: "clientNom", headerName: t("documents.columnClient"), flex: 1, minWidth: 140 },
      {
        field: "dateEcheance",
        headerName: t("dashboard.columnDueDate"),
        width: 110,
        valueFormatter: (p) => (p.value ? formatDate(p.value, locale) : "-"),
      },
      {
        field: "resteAPayer",
        headerName: t("invoices.columnBalance"),
        width: 130,
        type: "rightAligned",
        valueFormatter: (p) => formatMontant(p.value ?? 0, "TND", locale),
      },
      {
        field: "statut",
        headerName: t("documents.columnStatus"),
        width: 130,
        cellRenderer: (params: { value?: string }) =>
          params.value ? <StatutBadge statut={params.value} /> : null,
      },
    ],
    [t, locale],
  );
}

export function DashboardInvoiceGrid({
  rows,
  emptyMessage,
}: {
  rows: DashboardFactureRow[];
  emptyMessage: string;
}) {
  const columnDefs = useColumns();
  return (
    <MiniGrid<DashboardFactureRow>
      columnDefs={columnDefs}
      rowData={rows}
      getRowId={(d) => d.id}
      emptyMessage={emptyMessage}
      height={rows.length ? Math.min(340, 46 + rows.length * 48) : 200}
    />
  );
}
