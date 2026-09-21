"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColDef } from "ag-grid-community";
import { MiniGrid } from "@/components/datagrid/MiniGrid";
import { StatutBadge } from "@/components/StatutBadge";
import { formatMontant, formatDate } from "@/lib/format";

export interface DashboardFactureRow {
  id: string;
  numero: string;
  clientNom: string;
  dateEcheance: string | null;
  resteAPayer: number;
  statut: string;
}

function useColumns(): ColDef<DashboardFactureRow>[] {
  return useMemo(
    () => [
      {
        field: "numero",
        headerName: "Numero",
        flex: 1,
        minWidth: 130,
        cellRenderer: (params: { data?: DashboardFactureRow }) =>
          params.data ? (
            <Link href={`/factures/${params.data.id}`} className="font-medium text-brand-800 hover:underline">
              {params.data.numero}
            </Link>
          ) : null,
      },
      { field: "clientNom", headerName: "Client", flex: 1, minWidth: 140 },
      {
        field: "dateEcheance",
        headerName: "Echeance",
        width: 110,
        valueFormatter: (p) => (p.value ? formatDate(p.value) : "-"),
      },
      {
        field: "resteAPayer",
        headerName: "Reste a payer",
        width: 130,
        type: "rightAligned",
        valueFormatter: (p) => formatMontant(p.value ?? 0),
      },
      {
        field: "statut",
        headerName: "Statut",
        width: 130,
        cellRenderer: (params: { value?: string }) =>
          params.value ? <StatutBadge statut={params.value} /> : null,
      },
    ],
    [],
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
      height={rows.length ? Math.min(280, 56 + rows.length * 42) : 120}
    />
  );
}
