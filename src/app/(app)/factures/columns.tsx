"use client";

import Link from "next/link";
import type { ColDef } from "ag-grid-community";
import { StatutBadge } from "@/components/StatutBadge";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { formatMontant, formatDate } from "@/lib/format";
import type { GridFilterField } from "@/components/datagrid/types";

export interface FactureRow {
  id: string;
  numero: string;
  clientNom: string;
  clientEmail: string | null;
  dateEmission: string;
  dateEcheance: string | null;
  montantHT: number;
  taxes: number;
  montantTTC: number;
  montantPaye: number;
  resteAPayer: number;
  statut: string;
}

export function buildFactureColumns(
  getActions: (row: FactureRow) => RowAction[],
): ColDef<FactureRow>[] {
  return [
    {
      field: "numero",
      headerName: "Numero",
      filter: "agTextColumnFilter",
      width: 160,
      pinned: "left",
      cellRenderer: (params: { data?: FactureRow }) =>
        params.data ? (
          <Link href={`/factures/${params.data.id}`} className="font-medium text-brand-800 hover:underline">
            {params.data.numero}
          </Link>
        ) : null,
    },
    { field: "clientNom", headerName: "Client", filter: "agTextColumnFilter", flex: 1, minWidth: 170 },
    {
      field: "dateEmission",
      headerName: "Date d'emission",
      filter: "agDateColumnFilter",
      width: 140,
      valueFormatter: (p) => formatDate(p.value),
    },
    {
      field: "dateEcheance",
      headerName: "Date d'echeance",
      filter: "agDateColumnFilter",
      width: 140,
      valueFormatter: (p) => (p.value ? formatDate(p.value) : "-"),
    },
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
      field: "montantPaye",
      headerName: "Montant paye",
      filter: "agNumberColumnFilter",
      width: 130,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0),
    },
    {
      field: "resteAPayer",
      headerName: "Reste a payer",
      filter: "agNumberColumnFilter",
      width: 130,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0),
      cellClass: (p) => (Number(p.value) > 0 ? "text-red-600 font-medium" : undefined),
    },
    {
      field: "statut",
      headerName: "Statut",
      width: 170,
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
      cellRenderer: (params: { data?: FactureRow }) =>
        params.data ? (
          <RowActionsMenu label={`Actions pour ${params.data.numero}`} actions={getActions(params.data)} />
        ) : null,
    },
  ];
}

export const FACTURE_FILTER_FIELDS: GridFilterField[] = [
  {
    key: "statut",
    label: "Statut",
    type: "set",
    options: [
      { value: "BROUILLON", label: "Brouillon" },
      { value: "ENVOYEE", label: "Envoyee" },
      { value: "PARTIELLEMENT_PAYEE", label: "Partiellement payee" },
      { value: "PAYEE", label: "Payee" },
      { value: "EN_RETARD", label: "En retard" },
      { value: "ANNULEE", label: "Annulee" },
    ],
  },
  { key: "dateEmission", label: "Date d'emission", type: "dateRange" },
];
