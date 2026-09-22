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

  return (
    <div>
      <ActiveFilters chips={chips} onRemoveChip={handleRemoveChip} onClearAll={clearAllFilters} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t("common.refresh")}
        </button>
        {headerActions && <div className="flex flex-wrap items-center gap-2">{headerActions}</div>}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder={resolvedPlaceholder}
              aria-label={t("common.quickSearchLabel")}
              className="w-56 rounded-md border border-neutral-200 py-1.5 ps-8 pe-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            {t("common.display")}:
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-md border border-neutral-200 py-1.5 ps-2 pe-6 text-sm focus:border-brand-500 focus:outline-none"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveFilter}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {t("common.saveFilter")}
          </button>
          <button
            type="button"
            onClick={handleResetFilter}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {t("common.resetFilter")}
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
          {error ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden="true" />
              <p className="text-sm font-medium text-neutral-900">{t("common.error")}</p>
              <p className="text-sm text-neutral-500">{error}</p>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="mt-2 rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
                >
                  {t("common.tryAgain")}
                </button>
              )}
            </div>
          ) : (
            <div style={{ height: 560, width: "100%" }}>
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
                overlayNoRowsTemplate={`<div style="padding:2.5rem;text-align:center;"><div style="font-size:0.875rem;font-weight:500;color:#404040;">${resolvedEmptyTitle}</div><div style="font-size:0.8125rem;color:#a3a3a3;margin-top:4px;">${resolvedEmptyDescription}</div></div>`}
                suppressCellFocus
                animateRows
              />
            </div>
          )}
        </div>

        {!error && (
          <div className="flex w-20 shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => setFilterDrawerOpen(true)}
              className="flex flex-col items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-3 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {t("common.filters")}
            </button>
            <button
              type="button"
              onClick={() => {
                refreshColumnItems();
                setColumnDrawerOpen(true);
              }}
              className="flex flex-col items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-3 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            >
              <Columns3 className="h-4 w-4" aria-hidden="true" />
              {t("common.columns")}
            </button>
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
