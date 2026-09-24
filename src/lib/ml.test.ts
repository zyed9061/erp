import { describe, expect, it } from "vitest";
import { createTranslator } from "@/i18n/translate";
import { LOCALES } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { parseReasons, reasonText, showsRisk, SEGMENTS } from "./ml";

// Codes produced by ml/train (late_payment.REASONS / anomalies.run). Keep in sync.
const RISK_REASONS = [
  "CLIENT_LATE_HISTORY", "CLIENT_AVG_DELAY", "OPEN_BALANCE", "LARGE_AMOUNT", "HOLIDAY_DUE_DATE",
  "QUARTER_END", "INDIVIDUAL_CLIENT", "NEW_CLIENT", "SHORT_TERMS", "NO_DUE_DATE",
];
const ANOMALY_REASONS = [
  "POSSIBLE_DUPLICATE", "VAT_MISMATCH", "UNUSUAL_QUANTITY", "UNUSUAL_DISCOUNT", "UNUSUAL_AMOUNT", "UNUSUAL_PATTERN",
];

describe("ML reason texts", () => {
  it("has a translation for every reason, segment and risk level in every language", () => {
    for (const locale of LOCALES) {
      const ml = dictionaries[locale].ml;
      for (const code of RISK_REASONS) expect(ml.reasons[code as keyof typeof ml.reasons], `${locale} ${code}`).toBeTruthy();
      for (const code of ANOMALY_REASONS) expect(ml.anomalies[code as keyof typeof ml.anomalies], `${locale} ${code}`).toBeTruthy();
      for (const s of SEGMENTS) expect(ml.segment[s], `${locale} ${s}`).toBeTruthy();
      for (const r of ["LOW", "MEDIUM", "HIGH"] as const) expect(ml.risk[r]).toBeTruthy();
    }
  });

  it("fills values and formats amounts for the locale", () => {
    const fr = createTranslator("fr");
    const text = reasonText(fr, "fr", "reasons", { code: "OPEN_BALANCE", values: { count: 2, amount: 1234.5 } });
    expect(text).toContain("2");
    expect(text).toContain("1 234,500 DT");

    const en = createTranslator("en");
    expect(reasonText(en, "en", "reasons", { code: "CLIENT_LATE_HISTORY", values: { late: 5, known: 8, rate: 62 } })).toBe(
      "5 of this client's 8 previous invoices were paid late (62%)",
    );
    expect(reasonText(en, "en", "anomalies", { code: "POSSIBLE_DUPLICATE", values: { numero: "FAC-2026-0001" } })).toBe(
      "Possible duplicate of invoice FAC-2026-0001",
    );
  });

  it("skips unknown codes and malformed JSON", () => {
    const en = createTranslator("en");
    expect(reasonText(en, "en", "reasons", { code: "SOMETHING_NEW" })).toBeNull();
    expect(parseReasons(null)).toEqual([]);
    expect(parseReasons("oops")).toEqual([]);
    expect(parseReasons([{ code: "VAT_MISMATCH" }, { nope: 1 }, 3])).toEqual([{ code: "VAT_MISMATCH" }]);
  });

  it("only shows a risk while something is left to pay", () => {
    expect(showsRisk("ENVOYEE", 100)).toBe(true);
    expect(showsRisk("PARTIELLEMENT_PAYEE", 10)).toBe(true);
    expect(showsRisk("PAYEE", 0)).toBe(false);
    expect(showsRisk("ENVOYEE", 0)).toBe(false);
    expect(showsRisk("ANNULEE", 100)).toBe(false);
  });
});
