export type SetFilterValue = string[];

export interface GridFilterOption {
  value: string;
  label: string;
}

export interface GridFilterField {
  /** Must match the colId / field of the target column. */
  key: string;
  label: string;
  type: "set" | "text" | "dateRange";
  options?: GridFilterOption[];
}

export interface SavedGridState {
  columnState?: unknown[];
  filterModel?: Record<string, unknown> | null;
  setFilters?: Record<string, SetFilterValue>;
  dateRangeFilters?: Record<string, { from?: string; to?: string }>;
  quickFilter?: string;
  pageSize?: number;
}
