"use client";

import Link from "next/link";
import type { ColDef } from "ag-grid-community";
import { ActifBadge } from "@/components/StatutBadge";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { formatMontant } from "@/lib/format";
import type { GridFilterField } from "@/components/datagrid/types";

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
  getActions: (row: ProduitRow) => RowAction[],
): ColDef<ProduitRow>[] {
  return [
    { field: "reference", headerName: "Reference", filter: "agTextColumnFilter", width: 130 },
    {
      field: "designation",
      headerName: "Nom",
      filter: "agTextColumnFilter",
      flex: 1.3,
      minWidth: 200,
      pinned: "left",
      cellRenderer: (params: { data?: ProduitRow }) =>
        params.data ? (
          <Link href={`/produits/${params.data.id}`} className="font-medium text-brand-800 hover:underline">
            {params.data.designation}
          </Link>
        ) : null,
    },
    {
      field: "type",
      headerName: "Type",
      width: 110,
      filter: false,
      valueFormatter: (p) => (p.value === "SERVICE" ? "Service" : "Produit"),
    },
    {
      field: "description",
      headerName: "Description",
      filter: "agTextColumnFilter",
      flex: 1,
      minWidth: 160,
    },
    {
      field: "prixUnitaireHT",
      headerName: "Prix HT",
      filter: "agNumberColumnFilter",
      width: 120,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0),
    },
    {
      field: "tauxTva",
      headerName: "Taux de taxe",
      filter: "agNumberColumnFilter",
      width: 120,
      type: "rightAligned",
      valueFormatter: (p) => `${p.value ?? 0}%`,
    },
    {
      field: "prixTTC",
      headerName: "Prix TTC",
      filter: "agNumberColumnFilter",
      width: 120,
      type: "rightAligned",
      valueFormatter: (p) => formatMontant(p.value ?? 0),
    },
    { field: "uniteMesure", headerName: "Unite", width: 100, filter: false },
    { field: "categorie", headerName: "Categorie", filter: "agTextColumnFilter", width: 140 },
    {
      field: "stock",
      headerName: "Stock",
      filter: "agNumberColumnFilter",
      width: 100,
      type: "rightAligned",
      valueFormatter: (p) => (p.data?.type === "SERVICE" ? "-" : (p.value ?? "-")),
    },
    {
      field: "actif",
      headerName: "Statut",
      width: 120,
      filter: false,
      cellRenderer: (params: { value?: boolean }) => (
        <ActifBadge actif={Boolean(params.value)} inactiveLabel="Inactif" />
      ),
      valueFormatter: (p) => (p.value ? "Actif" : "Inactif"),
    },
    {
      colId: "__actions",
      headerName: "Actions",
      width: 90,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: "right",
      cellRenderer: (params: { data?: ProduitRow }) =>
        params.data ? (
          <RowActionsMenu
            label={`Actions pour ${params.data.designation}`}
            actions={getActions(params.data)}
          />
        ) : null,
    },
  ];
}

export function buildProduitFilterFields(rows: ProduitRow[]): GridFilterField[] {
  const categories = Array.from(new Set(rows.map((r) => r.categorie).filter(Boolean))) as string[];

  return [
    {
      key: "type",
      label: "Type",
      type: "set",
      options: [
        { value: "PRODUIT", label: "Produit" },
        { value: "SERVICE", label: "Service" },
      ],
    },
    {
      key: "categorie",
      label: "Categorie",
      type: "set",
      options: categories.map((c) => ({ value: c, label: c })),
    },
    {
      key: "actif",
      label: "Statut",
      type: "set",
      options: [
        { value: "true", label: "Actif" },
        { value: "false", label: "Inactif" },
      ],
    },
  ];
}
