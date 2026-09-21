"use client";

import Link from "next/link";
import type { ColDef } from "ag-grid-community";
import { StatutBadge } from "@/components/StatutBadge";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { formatMontant, formatDate } from "@/lib/format";
import type { GridFilterField } from "@/components/datagrid/types";

export interface DevisRow {
  id: string;
  numero: string;
  clientNom: string;
  clientEmail: string | null;
  dateEmission: string;
  dateValidite: string | null;
  montantHT: number;
  montantTTC: number;
  statut: string;
  updatedAt: string;
  hasFacture: boolean;
}

export function buildDevisColumns(getActions: (row: DevisRow) => RowAction[]): ColDef<DevisRow>[] {
  return [
    {
      field: "numero",
      headerName: "Numero",
      filter: "agTextColumnFilter",
      width: 160,
      pinned: "left",
      cellRenderer: (params: { data?: DevisRow }) =>
        params.data ? (
          <Link href={`/devis/${params.data.id}`} className="font-medium text-brand-800 hover:underline">
            {params.data.numero}
          </Link>
        ) : null,
    },
    { field: "clientNom", headerName: "Client", filter: "agTextColumnFilter", flex: 1, minWidth: 180 },
    {
      field: "dateEmission",
      headerName: "Date",
      filter: "agDateColumnFilter",
      width: 130,
      valueFormatter: (p) => formatDate(p.value),
    },
    {
      field: "dateValidite",
      headerName: "Date d'expiration",
      filter: "agDateColumnFilter",
      width: 150,
      valueFormatter: (p) => (p.value ? formatDate(p.value) : "-"),
    },
    {
      field: "montantHT",
      headerName: "Montant HT",
      filter: "agNumberColumnFilter",
      width: 140,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0),
    },
    {
      field: "montantTTC",
      headerName: "Montant TTC",
      filter: "agNumberColumnFilter",
      width: 140,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0),
    },
    {
      field: "statut",
      headerName: "Statut",
      width: 150,
      filter: false,
      cellRenderer: (params: { value?: string }) =>
        params.value ? <StatutBadge statut={params.value} /> : null,
    },
    {
      field: "updatedAt",
      headerName: "Derniere modification",
      filter: "agDateColumnFilter",
      width: 170,
      valueFormatter: (p) => formatDate(p.value),
    },
    {
      colId: "__actions",
      headerName: "Actions",
      width: 90,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: "right",
      cellRenderer: (params: { data?: DevisRow }) =>
        params.data ? (
          <RowActionsMenu label={`Actions pour ${params.data.numero}`} actions={getActions(params.data)} />
        ) : null,
    },
  ];
}

export const DEVIS_FILTER_FIELDS: GridFilterField[] = [
  {
    key: "statut",
    label: "Statut",
    type: "set",
    options: [
      { value: "BROUILLON", label: "Brouillon" },
      { value: "ENVOYE", label: "Envoye" },
      { value: "ACCEPTE", label: "Accepte" },
      { value: "REFUSE", label: "Refuse" },
      { value: "EXPIRE", label: "Expire" },
      { value: "CONVERTI", label: "Converti en facture" },
    ],
  },
  { key: "dateEmission", label: "Date d'emission", type: "dateRange" },
];
