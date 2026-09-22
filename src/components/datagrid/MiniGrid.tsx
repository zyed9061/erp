"use client";

import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import "./gridSetup";
import { appGridTheme } from "./gridSetup";

export function MiniGrid<T>({
  columnDefs,
  rowData,
  getRowId,
  emptyMessage = "Aucune donnee",
  height = 260,
}: {
  columnDefs: ColDef<T>[];
  rowData: T[];
  getRowId?: (data: T) => string;
  emptyMessage?: string;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <AgGridReact<T>
        theme={appGridTheme}
        columnDefs={columnDefs}
        rowData={rowData}
        defaultColDef={{ resizable: true, sortable: true }}
        suppressCellFocus
        animateRows
        getRowId={getRowId ? (params) => getRowId(params.data as T) : undefined}
        overlayNoRowsTemplate={`<div style="padding:1.5rem;color:#a3a3a3;font-size:0.8125rem;">${emptyMessage}</div>`}
      />
    </div>
  );
}
