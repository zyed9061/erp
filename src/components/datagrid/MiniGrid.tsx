"use client";

import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { useLocale } from "@/i18n/client";
import "./gridSetup";
import { appGridTheme } from "./gridSetup";
import { AG_GRID_LOCALE_TEXT } from "./gridLocale";

export function MiniGrid<T>({
  columnDefs,
  rowData,
  getRowId,
  emptyMessage,
  height = 260,
}: {
  columnDefs: ColDef<T>[];
  rowData: T[];
  getRowId?: (data: T) => string;
  emptyMessage?: string;
  height?: number;
}) {
  const { t, locale, dir } = useLocale();
  const resolvedEmptyMessage = emptyMessage ?? t("common.noData");

  return (
    <div style={{ height }}>
      <AgGridReact<T>
        // localeText, enableRtl and the overlay template are init-only, so remount the grid when the
        // language changes. The empty message is part of the key because it may come from a server
        // component, whose re-rendered (translated) props arrive after the client-side locale switch.
        key={`${locale}:${resolvedEmptyMessage}`}
        localeText={AG_GRID_LOCALE_TEXT[locale]}
        enableRtl={dir === "rtl"}
        theme={appGridTheme}
        columnDefs={columnDefs}
        rowData={rowData}
        defaultColDef={{ resizable: true, sortable: true }}
        suppressCellFocus
        animateRows
        getRowId={getRowId ? (params) => getRowId(params.data as T) : undefined}
        overlayNoRowsTemplate={`<div style="padding:1.5rem;color:#a3a3a3;font-size:0.8125rem;">${resolvedEmptyMessage}</div>`}
      />
    </div>
  );
}
