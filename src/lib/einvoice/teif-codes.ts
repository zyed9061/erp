import { z } from "zod";
import raw from "./spec.json";

/**
 * Données de la spécification TEIF de TTN, chargées depuis `spec.json`.
 *
 * ÉTAT : les documents officiels (XSD, annexe A des codes, guide d'implémentation) sont « À FOURNIR PAR TTN ».
 * Aucun code n'est deviné : une valeur absente reste `null` et apparaît dans le XML sous la forme `PENDING_CODE`, pour que
 * le fichier ne puisse pas passer pour valide. Quand TTN fournit ses documents, on complète `spec.json` (chaque code avec sa
 * source) sans toucher au code. Le chargement refuse un code renseigné sans source.
 */

export const GENERATOR_VERSION = "prep-2";
export const PENDING_CODE = "A-FOURNIR-PAR-TTN";

const codeSchema = z.object({
  label: z.string().min(1),
  code: z.string().min(1).nullable(),
  source: z.string().min(1).nullable(),
  official: z.boolean(),
}).superRefine((c, ctx) => {
  if (c.code !== null && c.source === null) ctx.addIssue({ code: "custom", message: `Code « ${c.code} » (${c.label}) renseigné sans source` });
  if (c.official && c.source === null) ctx.addIssue({ code: "custom", message: `Code officiel sans source (${c.label})` });
});

const specSchema = z.object({
  teifVersion: z.object({ value: z.string().nullable(), official: z.boolean(), source: z.string().nullable() }),
  dateFormat: z.object({ value: z.string().nullable(), official: z.boolean(), source: z.string().nullable(), label: z.string() }),
  codes: z.record(z.string(), codeSchema),
});

export type TeifSpec = z.infer<typeof specSchema>;

/** Valide et retourne une spécification (exporté pour les tests et pour un futur chargement d'un autre fichier). */
export const parseSpec = (input: unknown): TeifSpec => specSchema.parse(input);

export const SPEC = parseSpec(raw);

export type TeifCodeKey = keyof (typeof raw)["codes"];

export const TEIF_VERSION = SPEC.teifVersion.value ?? PENDING_CODE;

export const codeOf = (key: TeifCodeKey, spec: TeifSpec = SPEC): string => spec.codes[key]?.code ?? PENDING_CODE;

export const dateFormat = (spec: TeifSpec = SPEC): string => spec.dateFormat.value ?? PENDING_CODE;

export type SpecItem = { key: string; label: string; state: "official" | "secondary" | "pending" };

/** État de chaque élément de la spécification : officiel, issu d'une source non officielle, ou à fournir par TTN. */
export function specReport(spec: TeifSpec = SPEC): { items: SpecItem[]; official: number; secondary: number; pending: number } {
  const items: SpecItem[] = Object.entries(spec.codes).map(([key, c]) => ({
    key, label: c.label, state: c.code === null ? "pending" : c.official ? "official" : "secondary",
  }));
  items.push({
    key: "dateFormat", label: spec.dateFormat.label,
    state: spec.dateFormat.value === null ? "pending" : spec.dateFormat.official ? "official" : "secondary",
  });
  const n = (s: SpecItem["state"]) => items.filter((i) => i.state === s).length;
  return { items, official: n("official"), secondary: n("secondary"), pending: n("pending") };
}

/** Libellés des éléments encore à fournir par TTN. */
export const pendingLabels = (spec: TeifSpec = SPEC) => specReport(spec).items.filter((i) => i.state === "pending").map((i) => i.label);
