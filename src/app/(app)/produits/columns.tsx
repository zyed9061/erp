"use client";

import Link from "next/link";
import type { ColDef } from "ag-grid-community";
import { ActifBadge } from "@/components/StatutBadge";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { formatMontant } from "@/lib/format";
import type { GridFilterField } from "@/components/datagrid/types";
import type { Translator } from "@/i18n/translate";
import type { Locale } from "@/i18n/config";

export interface ProduitRow {
  id: string;
  reference: string | null;
  designation: string;
  type: "PRODUIT" | "SERVICE";
  description: string | null;
  prixUnitaireHT: number;
  tauxTva: number;
  prixTTC: number;
  uniteMesure: string;
  categorie: string | null;
  stock: number | null;
  actif: boolean;
}

export function buildProduitColumns(
  t: Translator,
  locale: Locale,
  getActions: (row: ProduitRow) => RowAction[],
): ColDef<ProduitRow>[] {
  return [
    { field: "reference", headerName: t("products.columnReference"), filter: "agTextColumnFilter", width: 130 },
    {
      field: "designation",
      headerName: t("products.columnName"),
      filter: "agTextColumnFilter",
      flex: 1.3,
      minWidth: 200,
      pinned: "left",
      cellRenderer: (params: { data?: ProduitRow }) =>
        params.data ? (
          <Link href={`/produits/${params.data.id}`} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
            {params.data.designation}
          </Link>
        ) : null,
    },
    {
      field: "type",
      headerName: t("products.columnType"),
      width: 110,
      filter: false,
      valueFormatter: (p) => (p.value === "SERVICE" ? t("products.typeService") : t("products.typeProduct")),
    },
    {
      field: "description",
      headerName: t("products.columnDescription"),
      filter: "agTextColumnFilter",
      flex: 1,
      minWidth: 160,
    },
    {
      field: "prixUnitaireHT",
      headerName: t("products.columnPriceHT"),
      filter: "agNumberColumnFilter",
      width: 120,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0, "TND", locale),
    },
    {
      field: "tauxTva",
      headerName: t("products.columnTaxRate"),
      filter: "agNumberColumnFilter",
      width: 120,
      type: "rightAligned",
      valueFormatter: (p) => `${p.value ?? 0}%`,
    },
    {
      field: "prixTTC",
      headerName: t("products.columnPriceTTC"),
      filter: "agNumberColumnFilter",
      width: 120,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0, "TND", locale),
    },
    { field: "uniteMesure", headerName: t("products.columnUnit"), width: 100, filter: false },
    { field: "categorie", headerName: t("products.columnCategory"), filter: "agTextColumnFilter", width: 140 },
    {
      field: "stock",
      headerName: t("products.columnStock"),
      filter: "agNumberColumnFilter",
      width: 100,
      type: "rightAligned",
      valueFormatter: (p) => (p.data?.type === "SERVICE" ? "-" : (p.value ?? "-")),
    },
    {
      field: "actif",
      headerName: t("products.columnStatus"),
      width: 120,
      filter: false,
      cellRenderer: (params: { value?: boolean }) => (
        <ActifBadge actif={Boolean(params.value)} inactiveLabel={t("common.inactive")} />
      ),
      valueFormatter: (p) => (p.value ? t("common.active") : t("common.inactive")),
    },
    {
      colId: "__actions",
      headerName: t("common.actions"),
      width: 90,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: "right",
      cellRenderer: (params: { data?: ProduitRow }) =>
        params.data ? (
          <RowActionsMenu
            label={t("common.actionsFor", { name: params.data.designation })}
            actions={getActions(params.data)}
          />
        ) : null,
    },
  ];
}

export function buildProduitFilterFields(t: Translator, rows: ProduitRow[]): GridFilterField[] {
  const categories = Array.from(new Set(rows.map((r) => r.categorie).filter(Boolean))) as string[];

  return [
    {
      key: "type",
      label: t("products.filterType"),
      type: "set",
      options: [
        { value: "PRODUIT", label: t("products.typeProduct") },
        { value: "SERVICE", label: t("products.typeService") },
      ],
    },
    {
      key: "categorie",
      label: t("products.filterCategory"),
      type: "set",
      options: categories.map((c) => ({ value: c, label: c })),
    },
    {
      key: "actif",
      label: t("products.filterStatus"),
      type: "set",
      options: [
        { value: "true", label: t("common.active") },
        { value: "false", label: t("common.inactive") },
      ],
    },
  ];
}
