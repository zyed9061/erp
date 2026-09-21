import type { SavedGridState } from "./types";

function key(moduleKey: string, userId?: string) {
  return `erp:grid-prefs:${moduleKey}:${userId ?? "anon"}`;
}

export function loadGridState(moduleKey: string, userId?: string): SavedGridState | null {
  try {
    const raw = window.localStorage.getItem(key(moduleKey, userId));
    if (!raw) return null;
    return JSON.parse(raw) as SavedGridState;
  } catch {
    return null;
  }
}

export function saveGridState(moduleKey: string, state: SavedGridState, userId?: string) {
  try {
    window.localStorage.setItem(key(moduleKey, userId), JSON.stringify(state));
  } catch {
    // localStorage unavailable (e.g. private browsing) — silently ignore.
  }
}

export function clearGridState(moduleKey: string, userId?: string) {
  try {
    window.localStorage.removeItem(key(moduleKey, userId));
  } catch {
    // ignore
  }
}
