"use client";

import Link from "next/link";
import type { ColDef } from "ag-grid-community";
import { StatutBadge } from "@/components/StatutBadge";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { formatMontant, formatDate } from "@/lib/format";
import type { GridFilterField } from "@/components/datagrid/types";
import type { Translator } from "@/i18n/translate";
import type { Locale } from "@/i18n/config";

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

export function buildDevisColumns(
  t: Translator,
  locale: Locale,
  getActions: (row: DevisRow) => RowAction[],
): ColDef<DevisRow>[] {
  return [
    {
      field: "numero",
      headerName: t("documents.columnNumber"),
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
    { field: "clientNom", headerName: t("documents.columnClient"), filter: "agTextColumnFilter", flex: 1, minWidth: 180 },
    {
      field: "dateEmission",
      headerName: t("documents.columnDate"),
      filter: "agDateColumnFilter",
      width: 130,
      valueFormatter: (p) => formatDate(p.value, locale),
    },
    {
      field: "dateValidite",
      headerName: t("quotes.columnExpiry"),
      filter: "agDateColumnFilter",
      width: 150,
      valueFormatter: (p) => (p.value ? formatDate(p.value, locale) : "-"),
    },
    {
      field: "montantHT",
      headerName: t("documents.columnAmountHT"),
      filter: "agNumberColumnFilter",
      width: 140,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0, "TND", locale),
    },
    {
      field: "montantTTC",
      headerName: t("documents.columnAmountTTC"),
      filter: "agNumberColumnFilter",
      width: 140,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0, "TND", locale),
    },
    {
      field: "statut",
      headerName: t("documents.columnStatus"),
      width: 150,
      filter: false,
      cellRenderer: (params: { value?: string }) =>
        params.value ? <StatutBadge statut={params.value} /> : null,
    },
    {
      field: "updatedAt",
      headerName: t("quotes.columnUpdatedAt"),
      filter: "agDateColumnFilter",
      width: 170,
      valueFormatter: (p) => formatDate(p.value, locale),
    },
    {
      colId: "__actions",
      headerName: t("common.actions"),
      width: 90,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: "right",
      cellRenderer: (params: { data?: DevisRow }) =>
        params.data ? (
          <RowActionsMenu label={t("common.actionsFor", { name: params.data.numero })} actions={getActions(params.data)} />
        ) : null,
    },
  ];
}

export function buildDevisFilterFields(t: Translator): GridFilterField[] {
  return [
    {
      key: "statut",
      label: t("documents.filterStatus"),
      type: "set",
      options: [
        ...["BROUILLON", "ENVOYE", "ACCEPTE", "REFUSE", "EXPIRE"].map((value) => ({
          value,
          label: t(`status.${value}`),
        })),
        { value: "CONVERTI", label: t("quotes.statusConverted") },
      ],
    },
    { key: "dateEmission", label: t("documents.filterIssueDate"), type: "dateRange" },
  ];
}
