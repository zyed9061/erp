import { describe, expect, it } from "vitest";
import { parseCsv } from "./import-scores";

describe("parseCsv", () => {
  it("parses quoted JSON fields written by pandas", () => {
    const csv =
      'facture_id,reasons,is_anomaly\r\n' +
      'a1,"[{""code"": ""CLIENT_AVG_DELAY"", ""values"": {""days"": 26}}]",False\r\n' +
      "a2,,True\r\n";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[0].reasons)).toEqual([{ code: "CLIENT_AVG_DELAY", values: { days: 26 } }]);
    expect(rows[1]).toEqual({ facture_id: "a2", reasons: "", is_anomaly: "True" });
  });

  it("handles a BOM, commas and newlines inside quotes, and a missing final newline", () => {
    const rows = parseCsv('﻿name,note\n"Atlas, SARL","line1\nline2"');
    expect(rows).toEqual([{ name: "Atlas, SARL", note: "line1\nline2" }]);
  });
});
