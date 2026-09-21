import { describe, expect, it } from "vitest";
import { amountInWords, integerInWords } from "@/lib/pdf/words";

describe("nombres en lettres (français)", () => {
  const cases: [number, string][] = [
    [0, "zéro"], [1, "un"], [16, "seize"], [17, "dix-sept"], [20, "vingt"], [21, "vingt et un"], [22, "vingt-deux"],
    [31, "trente et un"], [61, "soixante et un"], [70, "soixante-dix"], [71, "soixante et onze"], [72, "soixante-douze"],
    [79, "soixante-dix-neuf"], [80, "quatre-vingts"], [81, "quatre-vingt-un"], [91, "quatre-vingt-onze"],
    [99, "quatre-vingt-dix-neuf"], [100, "cent"], [101, "cent un"], [180, "cent quatre-vingts"],
    [200, "deux cents"], [201, "deux cent un"], [280, "deux cent quatre-vingts"], [383, "trois cent quatre-vingt-trois"],
    [414, "quatre cent quatorze"], [999, "neuf cent quatre-vingt-dix-neuf"],
    [1000, "mille"], [1001, "mille un"], [1080, "mille quatre-vingts"], [2000, "deux mille"],
    [80_000, "quatre-vingt mille"], [200_000, "deux cent mille"], [200_001, "deux cent mille un"],
    [1_200, "mille deux cents"], [1_000_000, "un million"], [2_000_000, "deux millions"],
    [2_000_080, "deux millions quatre-vingts"], [1_000_000_000, "un milliard"],
    [123_456_789, "cent vingt-trois millions quatre cent cinquante-six mille sept cent quatre-vingt-neuf"],
  ];
  for (const [n, words] of cases) {
    it(`${n} -> ${words}`, () => expect(integerInWords(n)).toBe(words));
  }
  it("refuse les valeurs hors limites", () => {
    expect(() => integerInWords(-1)).toThrow(RangeError);
    expect(() => integerInWords(1.5)).toThrow(RangeError);
    expect(() => integerInWords(1_000_000_000_000)).toThrow(RangeError);
  });
});

describe("montants en dinars", () => {
  it("écrit dinars et millimes avec les bons accords", () => {
    expect(amountInWords("383.414")).toBe("trois cent quatre-vingt-trois dinars et quatre cent quatorze millimes");
    expect(amountInWords("1.000")).toBe("un dinar");
    expect(amountInWords("1.001")).toBe("un dinar et un millime");
    expect(amountInWords("0.500")).toBe("zéro dinar et cinq cents millimes");
    expect(amountInWords("2.000")).toBe("deux dinars");
    expect(amountInWords("0.000")).toBe("zéro dinar");
    expect(amountInWords("1725.000")).toBe("mille sept cent vingt-cinq dinars");
    expect(amountInWords("80.080")).toBe("quatre-vingts dinars et quatre-vingts millimes");
  });
  it("gère un montant négatif (avoir)", () => {
    expect(amountInWords("-12.500")).toBe("moins douze dinars et cinq cents millimes");
  });
});
