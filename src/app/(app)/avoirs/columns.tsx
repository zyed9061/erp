"use client";

import Link from "next/link";
import type { ColDef } from "ag-grid-community";
import { StatutBadge } from "@/components/StatutBadge";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { formatMontant, formatDate } from "@/lib/format";
import type { GridFilterField } from "@/components/datagrid/types";

export interface AvoirRow {
  id: string;
  numero: string;
  clientNom: string;
  factureNumero: string;
  factureId: string;
  dateEmission: string;
  motif: string | null;
  montantHT: number;
  taxes: number;
  montantTTC: number;
  statut: string;
}

export function buildAvoirColumns(getActions: (row: AvoirRow) => RowAction[]): ColDef<AvoirRow>[] {
  return [
    {
      field: "numero",
      headerName: "Numero",
      filter: "agTextColumnFilter",
      width: 160,
      pinned: "left",
      cellRenderer: (params: { data?: AvoirRow }) =>
        params.data ? (
          <Link href={`/avoirs/${params.data.id}`} className="font-medium text-brand-800 hover:underline">
            {params.data.numero}
          </Link>
        ) : null,
    },
    { field: "clientNom", headerName: "Client", filter: "agTextColumnFilter", flex: 1, minWidth: 170 },
    {
      field: "factureNumero",
      headerName: "Facture associee",
      filter: "agTextColumnFilter",
      width: 160,
      cellRenderer: (params: { data?: AvoirRow }) =>
        params.data ? (
          <Link href={`/factures/${params.data.factureId}`} className="hover:underline">
            {params.data.factureNumero}
          </Link>
        ) : null,
    },
    {
      field: "dateEmission",
      headerName: "Date",
      filter: "agDateColumnFilter",
      width: 130,
      valueFormatter: (p) => formatDate(p.value),
    },
    { field: "motif", headerName: "Motif", filter: "agTextColumnFilter", flex: 1, minWidth: 160 },
    {
      field: "montantHT",
      headerName: "Montant HT",
      filter: "agNumberColumnFilter",
      width: 130,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0),
    },
    {
      field: "taxes",
      headerName: "Taxes",
      filter: "agNumberColumnFilter",
      width: 110,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0),
    },
    {
      field: "montantTTC",
      headerName: "Montant TTC",
      filter: "agNumberColumnFilter",
      width: 130,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0),
    },
    {
      field: "statut",
      headerName: "Statut",
      width: 140,
      filter: false,
      cellRenderer: (params: { value?: string }) =>
        params.value ? <StatutBadge statut={params.value} /> : null,
    },
    {
      colId: "__actions",
      headerName: "Actions",
      width: 90,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: "right",
      cellRenderer: (params: { data?: AvoirRow }) =>
        params.data ? (
          <RowActionsMenu label={`Actions pour ${params.data.numero}`} actions={getActions(params.data)} />
        ) : null,
    },
  ];
}

export const AVOIR_FILTER_FIELDS: GridFilterField[] = [
  {
    key: "statut",
    label: "Statut",
    type: "set",
    options: [
      { value: "EMIS", label: "Emis" },
      { value: "APPLIQUE", label: "Applique" },
      { value: "REMBOURSE", label: "Rembourse" },
      { value: "ANNULE", label: "Annule" },
    ],
  },
  { key: "dateEmission", label: "Date", type: "dateRange" },
];
