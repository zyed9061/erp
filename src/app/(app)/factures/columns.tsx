"use client";

import Link from "next/link";
import type { ColDef } from "ag-grid-community";
import { StatutBadge } from "@/components/StatutBadge";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { formatMontant, formatDate } from "@/lib/format";
import type { GridFilterField } from "@/components/datagrid/types";
import type { Translator } from "@/i18n/translate";
import type { Locale } from "@/i18n/config";

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
  t: Translator,
  locale: Locale,
  getActions: (row: FactureRow) => RowAction[],
): ColDef<FactureRow>[] {
  return [
    {
      field: "numero",
      headerName: t("documents.columnNumber"),
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
    { field: "clientNom", headerName: t("documents.columnClient"), filter: "agTextColumnFilter", flex: 1, minWidth: 170 },
    {
      field: "dateEmission",
      headerName: t("documents.issueDate"),
      filter: "agDateColumnFilter",
      width: 140,
      valueFormatter: (p) => formatDate(p.value, locale),
    },
    {
      field: "dateEcheance",
      headerName: t("invoices.columnDueDate"),
      filter: "agDateColumnFilter",
      width: 140,
      valueFormatter: (p) => (p.value ? formatDate(p.value, locale) : "-"),
    },
    {
      field: "montantHT",
      headerName: t("documents.columnAmountHT"),
      filter: "agNumberColumnFilter",
      width: 130,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0, "TND", locale),
    },
    {
      field: "taxes",
      headerName: t("documents.columnTaxes"),
      filter: "agNumberColumnFilter",
      width: 110,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0, "TND", locale),
    },
    {
      field: "montantTTC",
      headerName: t("documents.columnAmountTTC"),
      filter: "agNumberColumnFilter",
      width: 130,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0, "TND", locale),
    },
    {
      field: "montantPaye",
      headerName: t("invoices.columnAmountPaid"),
      filter: "agNumberColumnFilter",
      width: 130,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0, "TND", locale),
    },
    {
      field: "resteAPayer",
      headerName: t("invoices.columnBalance"),
      filter: "agNumberColumnFilter",
      width: 130,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0, "TND", locale),
      cellClass: (p) => (Number(p.value) > 0 ? "text-red-600 font-medium" : undefined),
    },
    {
      field: "statut",
      headerName: t("documents.columnStatus"),
      width: 170,
      filter: false,
      cellRenderer: (params: { value?: string }) =>
        params.value ? <StatutBadge statut={params.value} /> : null,
    },
    {
      colId: "__actions",
      headerName: t("common.actions"),
      width: 90,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: "right",
      cellRenderer: (params: { data?: FactureRow }) =>
        params.data ? (
          <RowActionsMenu label={t("common.actionsFor", { name: params.data.numero })} actions={getActions(params.data)} />
        ) : null,
    },
  ];
}

export function buildFactureFilterFields(t: Translator): GridFilterField[] {
  return [
    {
      key: "statut",
      label: t("documents.filterStatus"),
      type: "set",
      options: ["BROUILLON", "ENVOYEE", "PARTIELLEMENT_PAYEE", "PAYEE", "EN_RETARD", "ANNULEE"].map(
        (value) => ({ value, label: t(`status.${value}`) }),
      ),
    },
    { key: "dateEmission", label: t("documents.filterIssueDate"), type: "dateRange" },
  ];
}
