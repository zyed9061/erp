"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  IRowNode,
  RowClickedEvent,
} from "ag-grid-community";
import { RefreshCw, SlidersHorizontal, Columns3, Search, AlertTriangle } from "lucide-react";
import { useLocale } from "@/i18n/client";
import "./gridSetup";
import { appGridTheme } from "./gridSetup";
import { AG_GRID_LOCALE_TEXT } from "./gridLocale";
import { FilterDrawer } from "./FilterDrawer";
import { ColumnDrawer, type ColumnDrawerItem } from "./ColumnDrawer";
import { ActiveFilters, type ActiveFilterChip } from "./ActiveFilters";
import { loadGridState, saveGridState, clearGridState } from "./persistence";
import type { GridFilterField, SavedGridState, SetFilterValue } from "./types";

const PAGE_SIZES = [25, 50, 100, 250];
const DEFAULT_PAGE_SIZE = 25;

export interface DataGridProps<T> {
  moduleKey: string;
  userId?: string;
  columnDefs: ColDef<T>[];
  rowData: T[];
  filterFields?: GridFilterField[];
  quickSearchPlaceholder?: string;
  headerActions?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  getRowId?: (data: T) => string;
  onRowClicked?: (data: T) => void;
  onRefresh?: () => void;
}

/** HTML for AG Grid's "no rows" overlay (a template string, so no React here). */
export function emptyOverlay(title: string, description?: string) {
  const icon =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12h-6l-2 3h-2l-2-3H3"/><path d="M5.45 5.11 3 12v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6l-2.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>';
  return (
    `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:2rem;text-align:center;">` +
    `<div style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#eef2ff,#f5f3ff);margin-bottom:6px;">${icon}</div>` +
    `<div style="font-size:0.875rem;font-weight:600;color:#0f172a;">${title}</div>` +
    (description ? `<div style="font-size:0.8125rem;color:#64748b;">${description}</div>` : "") +
    `</div>`
  );
}

function describeNativeFilter(colId: string, headerName: string, model: Record<string, unknown>) {
  const entry = model[colId] as Record<string, unknown> | undefined;
  if (!entry) return null;
  if (entry.filterType === "date") {
    const from = entry.dateFrom as string | undefined;
    const to = entry.dateTo as string | undefined;
    return `${headerName}: ${from ?? ""}${to ? ` - ${to}` : ""}`;
  }
  if (entry.filterType === "number") {
    const value = entry.filter as number | undefined;
    const valueTo = entry.filterTo as number | undefined;
    return `${headerName}: ${value ?? ""}${valueTo ? ` - ${valueTo}` : ""}`;
  }
  const value = entry.filter as string | undefined;
  return `${headerName}: "${value ?? ""}"`;
}

export function DataGrid<T>({
  moduleKey,
  userId,
  columnDefs,
  rowData,
  filterFields = [],
  quickSearchPlaceholder,
  headerActions,
  loading = false,
  error = null,
  emptyTitle,
  emptyDescription,
  getRowId,
  onRowClicked,
  onRefresh,
}: DataGridProps<T>) {
  const { t, locale, dir } = useLocale();
  const resolvedPlaceholder = quickSearchPlaceholder ?? `${t("common.search")}...`;
  const resolvedEmptyTitle = emptyTitle ?? t("common.noResults");
  const resolvedEmptyDescription = emptyDescription ?? t("common.noResultsDescription");
  const gridApiRef = useRef<GridApi<T> | null>(null);
  const [gridReady, setGridReady] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [setFilters, setSetFilters] = useState<Record<string, SetFilterValue>>({});
  const [dateRangeFilters, setDateRangeFilters] = useState<
    Record<string, { from?: string; to?: string }>
  >({});
  const [nativeFilterModel, setNativeFilterModel] = useState<Record<string, unknown>>({});
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [columnDrawerOpen, setColumnDrawerOpen] = useState(false);
  const [columnItems, setColumnItems] = useState<ColumnDrawerItem[]>([]);
  const restoredRef = useRef(false);

  // AG Grid's localeText and enableRtl are init-only options, so the grid is remounted (keyed by
  // locale) when the language changes. Snapshot the live column/filter state before the old
  // instance is destroyed so the new one picks up exactly where the user was.
  const carryOverRef = useRef<{ columnState: unknown[]; filterModel: Record<string, unknown> } | null>(
    null,
  );
  useLayoutEffect(() => {
    return () => {
      const api = gridApiRef.current;
      if (api && !api.isDestroyed()) {
        carryOverRef.current = { columnState: api.getColumnState(), filterModel: api.getFilterModel() };
      }
    };
  }, [locale]);

  const dateRangeFieldsInMs = useMemo(
    () =>
      filterFields
        .filter((f) => f.type === "dateRange")
        .map((f) => f.key),
    [filterFields],
  );

  const doesExternalFilterPass = useCallback(
    (node: IRowNode<T>) => {
      const data = node.data as Record<string, unknown> | undefined;
      if (!data) return true;

      for (const [fieldKey, values] of Object.entries(setFilters)) {
        if (!values || values.length === 0) continue;
        const cellValue = data[fieldKey];
        if (!values.includes(String(cellValue))) return false;
      }

      for (const fieldKey of dateRangeFieldsInMs) {
        const range = dateRangeFilters[fieldKey];
        if (!range || (!range.from && !range.to)) continue;
        const raw = data[fieldKey];
        if (!raw) return false;
        const cellTime = new Date(raw as string).getTime();
        if (range.from && cellTime < new Date(range.from).getTime()) return false;
        if (range.to && cellTime > new Date(range.to).getTime() + 86_400_000 - 1) return false;
      }

      return true;
    },
    [setFilters, dateRangeFilters, dateRangeFieldsInMs],
  );

  const isExternalFilterPresent = useCallback(() => {
    const hasSet = Object.values(setFilters).some((values) => values && values.length > 0);
    const hasDate = Object.values(dateRangeFilters).some((range) => range?.from || range?.to);
    return hasSet || hasDate;
  }, [setFilters, dateRangeFilters]);

  useEffect(() => {
    gridApiRef.current?.onFilterChanged();
  }, [setFilters, dateRangeFilters]);

  useEffect(() => {
    if (gridReady) {
      gridApiRef.current?.setGridOption("paginationPageSize", pageSize);
    }
  }, [pageSize, gridReady]);

  const refreshColumnItems = useCallback(() => {
    const api = gridApiRef.current;
    if (!api) return;
    const state = api.getColumnState();
    const items: ColumnDrawerItem[] = state
      .filter((s) => s.colId !== "__actions" && !s.colId.startsWith("ag-Grid-"))
      .map((s) => {
        const col = api.getColumn(s.colId);
        return {
          colId: s.colId,
          headerName: (col?.getColDef().headerName as string) || s.colId,
          visible: !s.hide,
          pinned: Boolean(s.pinned),
        };
      });
    setColumnItems(items);
  }, []);

  const onGridReady = useCallback(
    (event: GridReadyEvent<T>) => {
      gridApiRef.current = event.api;
      setGridReady(true);

      const carried = carryOverRef.current;
      if (carried) {
        carryOverRef.current = null;
        event.api.applyColumnState({ state: carried.columnState as never[], applyOrder: true });
        event.api.setFilterModel(carried.filterModel);
      } else if (!restoredRef.current) {
        restoredRef.current = true;
        const saved = loadGridState(moduleKey, userId);
        if (saved) {
          if (saved.columnState) {
            event.api.applyColumnState({
              state: saved.columnState as never[],
              applyOrder: true,
            });
          }
          if (saved.filterModel) {
            event.api.setFilterModel(saved.filterModel);
          }
          if (saved.setFilters) setSetFilters(saved.setFilters);
          if (saved.dateRangeFilters) setDateRangeFilters(saved.dateRangeFilters);
          if (saved.quickFilter) setQuickSearch(saved.quickFilter);
          if (saved.pageSize) {
            setPageSize(saved.pageSize);
            event.api.setGridOption("paginationPageSize", saved.pageSize);
          }
        }
      }

      setNativeFilterModel(event.api.getFilterModel());
      refreshColumnItems();
    },
    [moduleKey, userId, refreshColumnItems],
  );

  function handleSaveFilter() {
    const api = gridApiRef.current;
    if (!api) return;
    const state: SavedGridState = {
      columnState: api.getColumnState(),
      filterModel: api.getFilterModel(),
      setFilters,
      dateRangeFilters,
      quickFilter: quickSearch,
      pageSize,
    };
    saveGridState(moduleKey, state, userId);
  }

  function handleResetFilter() {
    const api = gridApiRef.current;
    if (!api) return;
    api.setFilterModel(null);
    api.resetColumnState();
    setSetFilters({});
    setDateRangeFilters({});
    setQuickSearch("");
    setPageSize(DEFAULT_PAGE_SIZE);
    api.setGridOption("paginationPageSize", DEFAULT_PAGE_SIZE);
    api.setGridOption("quickFilterText", "");
    clearGridState(moduleKey, userId);
    refreshColumnItems();
    onRefresh?.();
  }

  function toggleSetValue(fieldKey: string, value: string) {
    setSetFilters((current) => {
      const existing = current[fieldKey] ?? [];
      const next = existing.includes(value)
        ? existing.filter((v) => v !== value)
        : [...existing, value];
      return { ...current, [fieldKey]: next };
    });
  }

  function changeDateRange(fieldKey: string, range: { from?: string; to?: string }) {
    setDateRangeFilters((current) => ({ ...current, [fieldKey]: range }));
  }

  function clearAllDrawerFilters() {
    setSetFilters({});
    setDateRangeFilters({});
  }

  function toggleColumnVisible(colId: string) {
    const api = gridApiRef.current;
    if (!api) return;
    const current = columnItems.find((c) => c.colId === colId);
    api.setColumnsVisible([colId], !(current?.visible ?? true));
    refreshColumnItems();
  }

  function moveColumn(colId: string, direction: "up" | "down") {
    const api = gridApiRef.current;
    if (!api) return;
    const index = columnItems.findIndex((c) => c.colId === colId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columnItems.length) return;
    api.moveColumnByIndex(index, targetIndex);
    refreshColumnItems();
  }

  function toggleColumnPin(colId: string) {
    const api = gridApiRef.current;
    if (!api) return;
    const current = columnItems.find((c) => c.colId === colId);
    api.setColumnsPinned([colId], current?.pinned ? null : "left");
    refreshColumnItems();
  }

  function resetColumns() {
    gridApiRef.current?.resetColumnState();
    refreshColumnItems();
  }

  const removeNativeFilter = useCallback((colId: string) => {
    const api = gridApiRef.current;
    if (!api) return;
    const model = { ...api.getFilterModel() };
    delete model[colId];
    api.setFilterModel(model);
  }, []);

  const headerNameByColId = useMemo(() => {
    const map = new Map<string, string>();
    for (const def of columnDefs) {
      const colId = (def.colId ?? (def as { field?: string }).field) as string | undefined;
      if (colId && def.headerName) map.set(colId, def.headerName);
    }
    return map;
  }, [columnDefs]);

  function computeChips(): ActiveFilterChip[] {
    const result: ActiveFilterChip[] = [];

    if (quickSearch) {
      result.push({ key: "__quick", label: t("common.searchChip", { query: quickSearch }) });
    }

    for (const field of filterFields) {
      if (field.type === "set") {
        const values = setFilters[field.key] ?? [];
        if (values.length === 0) continue;
        const labels = values.map(
          (v) => field.options?.find((o) => o.value === v)?.label ?? v,
        );
        result.push({ key: `set:${field.key}`, label: `${field.label}: ${labels.join(", ")}` });
      } else if (field.type === "dateRange") {
        const range = dateRangeFilters[field.key];
        if (!range?.from && !range?.to) continue;
        result.push({
          key: `date:${field.key}`,
          label: `${field.label}: ${range.from ?? "..."} - ${range.to ?? "..."}`,
        });
      }
    }

    for (const colId of Object.keys(nativeFilterModel)) {
      const headerName = headerNameByColId.get(colId) || colId;
      const desc = describeNativeFilter(colId, headerName, nativeFilterModel);
      if (desc) {
        result.push({ key: `native:${colId}`, label: desc });
      }
    }

    return result;
  }

  const chips = computeChips();

  function handleRemoveChip(key: string) {
    if (key === "__quick") {
      setQuickSearch("");
      return;
    }
    if (key.startsWith("set:")) {
      const fieldKey = key.slice(4);
      setSetFilters((c) => ({ ...c, [fieldKey]: [] }));
      return;
    }
    if (key.startsWith("date:")) {
      const fieldKey = key.slice(5);
      setDateRangeFilters((c) => ({ ...c, [fieldKey]: {} }));
      return;
    }
    if (key.startsWith("native:")) {
      removeNativeFilter(key.slice(7));
    }
  }

  function clearAllFilters() {
    const api = gridApiRef.current;
    api?.setFilterModel(null);
    setSetFilters({});
    setDateRangeFilters({});
    setQuickSearch("");
  }

  const defaultColDef = useMemo<ColDef<T>>(
    () => ({
      sortable: true,
      resizable: true,
      filter: true,
      minWidth: 110,
    }),
    [],
  );

  const drawerFilterCount =
    Object.values(setFilters).filter((values) => values && values.length > 0).length +
    Object.values(dateRangeFilters).filter((range) => range?.from || range?.to).length;

  return (
    <div>
      <div className="card mb-4 flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="group relative sm:w-72">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder={resolvedPlaceholder}
              aria-label={t("common.quickSearchLabel")}
              className="input h-10 ps-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap text-slate-500">
            {t("common.display")}
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="input h-10 w-auto py-0 pe-8"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          {headerActions && <div className="flex flex-wrap items-center gap-2 sm:ms-auto">{headerActions}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {!error && (
            <>
              <button type="button" onClick={() => setFilterDrawerOpen(true)} className="btn-secondary h-10">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                {t("common.filters")}
                {drawerFilterCount > 0 && (
                  <span className="bg-brand-gradient ms-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold text-white">
                    {drawerFilterCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  refreshColumnItems();
                  setColumnDrawerOpen(true);
                }}
                className="btn-secondary h-10"
              >
                <Columns3 className="h-4 w-4" aria-hidden="true" />
                {t("common.columns")}
              </button>
            </>
          )}
          <button type="button" onClick={handleSaveFilter} className="btn-ghost h-10">
            {t("common.saveFilter")}
          </button>
          <button type="button" onClick={handleResetFilter} className="btn-ghost h-10">
            {t("common.resetFilter")}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            aria-label={t("common.refresh")}
            title={t("common.refresh")}
            className="btn-secondary group ms-auto h-10 w-10 px-0"
          >
            <RefreshCw className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" aria-hidden="true" />
          </button>
        </div>
      </div>

      <ActiveFilters chips={chips} onRemoveChip={handleRemoveChip} onClearAll={clearAllFilters} />

      <div className="card overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 ring-8 ring-rose-50/50">
              <AlertTriangle className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="mt-2 text-sm font-semibold text-slate-900">{t("common.error")}</p>
            <p className="text-sm text-slate-500">{error}</p>
            {onRefresh && (
              <button type="button" onClick={onRefresh} className="btn-primary mt-3">
                {t("common.tryAgain")}
              </button>
            )}
          </div>
        ) : (
          <div className="h-[calc(100dvh-19rem)] min-h-[420px] w-full">
            <AgGridReact<T>
              key={locale}
              localeText={AG_GRID_LOCALE_TEXT[locale]}
              enableRtl={dir === "rtl"}
              theme={appGridTheme}
              columnDefs={columnDefs}
              rowData={rowData}
              defaultColDef={defaultColDef}
              quickFilterText={quickSearch}
              pagination
              paginationPageSize={pageSize}
              paginationPageSizeSelector={false}
              rowSelection={{ mode: "multiRow", checkboxes: true, headerCheckbox: true }}
              isExternalFilterPresent={isExternalFilterPresent}
              doesExternalFilterPass={doesExternalFilterPass}
              onFilterChanged={(e) => setNativeFilterModel(e.api.getFilterModel())}
              onGridReady={onGridReady}
              onColumnMoved={refreshColumnItems}
              onColumnVisible={refreshColumnItems}
              onColumnPinned={refreshColumnItems}
              getRowId={getRowId ? (params) => getRowId(params.data as T) : undefined}
              onRowClicked={
                onRowClicked
                  ? (e: RowClickedEvent<T>) => {
                      const target = e.event?.target as HTMLElement | null;
                      if (target?.closest("[data-no-row-click]")) return;
                      if (e.data) onRowClicked(e.data);
                    }
                  : undefined
              }
              loading={loading}
              overlayNoRowsTemplate={emptyOverlay(resolvedEmptyTitle, resolvedEmptyDescription)}
              suppressCellFocus
              animateRows
            />
          </div>
        )}
      </div>

      <FilterDrawer
        open={filterDrawerOpen}
        fields={filterFields}
        setFilters={setFilters}
        dateRangeFilters={dateRangeFilters}
        onToggleSetValue={toggleSetValue}
        onChangeDateRange={changeDateRange}
        onClose={() => setFilterDrawerOpen(false)}
        onClearAll={clearAllDrawerFilters}
      />

      <ColumnDrawer
        open={columnDrawerOpen}
        items={columnItems}
        onToggleVisible={toggleColumnVisible}
        onMove={moveColumn}
        onTogglePin={toggleColumnPin}
        onReset={resetColumns}
        onClose={() => setColumnDrawerOpen(false)}
      />
    </div>
  );
}
