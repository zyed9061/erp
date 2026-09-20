const tunisDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" });

/** Date du jour à Tunis au format YYYY-MM-DD (et non la date UTC, qui diffère après 23 h). */
export function todayTunis(now: Date = new Date()): string {
  return tunisDay.format(now);
}
