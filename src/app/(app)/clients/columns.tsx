"use client";

import Link from "next/link";
import type { ColDef } from "ag-grid-community";
import { ActifBadge } from "@/components/StatutBadge";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { formatMontant, formatDate } from "@/lib/format";
import type { GridFilterField } from "@/components/datagrid/types";
import type { Translator } from "@/i18n/translate";

export interface ClientRow {
  id: string;
  nom: string;
  type: "ENTREPRISE" | "PARTICULIER";
  email: string | null;
  telephone: string | null;
  ville: string | null;
  pays: string;
  totalFacture: number;
  soldeDu: number;
  derniereFacture: string | null;
  actif: boolean;
}

export function buildClientColumns(
  t: Translator,
  getActions: (row: ClientRow) => RowAction[],
): ColDef<ClientRow>[] {
  return [
    {
      field: "nom",
      headerName: t("clients.columnName"),
      filter: "agTextColumnFilter",
      flex: 1.4,
      minWidth: 200,
      pinned: "left",
      cellRenderer: (params: { data?: ClientRow }) =>
        params.data ? (
          <Link href={`/clients/${params.data.id}`} className="font-medium text-brand-800 hover:underline">
            {params.data.nom}
          </Link>
        ) : null,
    },
    {
      field: "type",
      headerName: t("clients.columnType"),
      width: 130,
      filter: false,
      valueFormatter: (p) => (p.value === "ENTREPRISE" ? t("clients.typeCompany") : t("clients.typeIndividual")),
    },
    { field: "email", headerName: t("clients.columnEmail"), filter: "agTextColumnFilter", flex: 1, minWidth: 180 },
    { field: "telephone", headerName: t("clients.columnPhone"), filter: "agTextColumnFilter", width: 150 },
    { field: "ville", headerName: t("clients.columnCity"), filter: "agTextColumnFilter", width: 140 },
    { field: "pays", headerName: t("clients.columnCountry"), filter: "agTextColumnFilter", width: 120 },
    {
      field: "totalFacture",
      headerName: t("clients.columnTotalInvoiced"),
      filter: "agNumberColumnFilter",
      width: 150,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0),
    },
    {
      field: "soldeDu",
      headerName: t("clients.columnBalanceDue"),
      filter: "agNumberColumnFilter",
      width: 140,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0),
      cellClass: (p) => (Number(p.value) > 0 ? "text-red-600 font-medium" : undefined),
    },
    {
      field: "derniereFacture",
      headerName: t("clients.columnLastInvoice"),
      filter: "agDateColumnFilter",
      width: 150,
      valueFormatter: (p) => (p.value ? formatDate(p.value) : "-"),
    },
    {
      field: "actif",
      headerName: t("clients.columnStatus"),
      width: 130,
      filter: false,
      cellRenderer: (params: { value?: boolean }) => <ActifBadge actif={Boolean(params.value)} />,
      valueFormatter: (p) => (p.value ? t("common.active") : t("common.archived")),
    },
    {
      colId: "__actions",
      headerName: t("clients.columnActions"),
      width: 90,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: "right",
      cellRenderer: (params: { data?: ClientRow }) =>
        params.data ? (
          <RowActionsMenu
            label={t("common.actionsFor", { name: params.data.nom })}
            actions={getActions(params.data)}
          />
        ) : null,
    },
  ];
}

export function buildClientFilterFields(t: Translator): GridFilterField[] {
  return [
    {
      key: "type",
      label: t("clients.filterFieldType"),
      type: "set",
      options: [
        { value: "ENTREPRISE", label: t("clients.typeCompany") },
        { value: "PARTICULIER", label: t("clients.typeIndividual") },
      ],
    },
    {
      key: "actif",
      label: t("clients.filterFieldStatus"),
      type: "set",
      options: [
        { value: "true", label: t("common.active") },
        { value: "false", label: t("common.archived") },
      ],
    },
  ];
}
