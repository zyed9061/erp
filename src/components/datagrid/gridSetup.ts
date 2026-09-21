import { ModuleRegistry, AllCommunityModule, themeQuartz } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

export const appGridTheme = themeQuartz.withParams({
  accentColor: "#0f172a",
  borderColor: "#e5e7eb",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 13,
  headerBackgroundColor: "#f8fafc",
  headerFontWeight: 600,
  headerTextColor: "#374151",
  oddRowBackgroundColor: "#ffffff",
  rowHoverColor: "#f8fafc",
  spacing: 7,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
});
