import { ModuleRegistry, AllCommunityModule, themeQuartz } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

export const appGridTheme = themeQuartz.withParams({
  accentColor: "#4f46e5",
  backgroundColor: "#ffffff",
  borderColor: "#eef0f4",
  borderRadius: 10,
  browserColorScheme: "light",
  checkboxCheckedBackgroundColor: "#4f46e5",
  checkboxCheckedBorderColor: "#4f46e5",
  columnBorder: false,
  fontFamily: "inherit",
  fontSize: 13,
  foregroundColor: "#0f172a",
  headerBackgroundColor: "#f8fafc",
  headerFontSize: 12,
  headerFontWeight: 600,
  headerHeight: 44,
  headerTextColor: "#64748b",
  oddRowBackgroundColor: "#ffffff",
  rowHeight: 48,
  rowHoverColor: "#eef2ff80",
  selectedRowBackgroundColor: "#eef2ff",
  spacing: 7,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
});
