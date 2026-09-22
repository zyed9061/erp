import type { CSSProperties } from "react";

/*
  Couleur unique par element, par famille.

  Chaque section a sa famille de couleurs (clients : vert, produits : bleu,
  devis : gris, avoirs : rouge, factures : rose). Dans une section, deux
  elements ne peuvent avoir ni la meme couleur ni une couleur trop proche
  (distance perceptuelle OKLab). Module pur : utilisable cote serveur
  (validation, attribution) et cote client (selecteur).
*/

export type Famille = "vert" | "bleu" | "gris" | "rouge" | "rose";
export type Entite = "client" | "produit" | "devis" | "avoir" | "facture";

export const FAMILLE_PAR_ENTITE: Record<Entite, Famille> = {
  client: "vert",
  produit: "bleu",
  devis: "gris",
  avoir: "rouge",
  facture: "rose",
};

type ConfigFamille = {
  /** Plage de teinte (degres) : de hueMin sur hueSpan degres (peut franchir 360). */
  hueMin: number;
  hueSpan: number;
  satMin: number;
  satMax: number;
  lightMin: number;
  lightMax: number;
  /** Distance minimale OKLab (x100) entre deux couleurs de la famille. */
  seuil: number;
  /** Eclaircissement applique en theme sombre (meme decalage pour tous : distances conservees). */
  deltaSombre: number;
  /** Reservoir d'attribution automatique. */
  hues: number[];
  sats: number[];
  lights: number[];
  /** Selecteur : lignes [saturation, luminosite] x 18 teintes reparties sur la plage. */
  lignesSelecteur: [number, number][];
};

const pas = (debut: number, fin: number, step: number) => {
  const out: number[] = [];
  for (let v = debut; v <= fin + 1e-9; v += step) out.push(v);
  return out;
};

const FAMILLES: Record<Famille, ConfigFamille> = {
  vert: {
    hueMin: 85, hueSpan: 85, satMin: 45, satMax: 100, lightMin: 24, lightMax: 54,
    seuil: 4, deltaSombre: 16,
    hues: pas(85, 170, 3), sats: [45, 60, 75, 90, 100], lights: [24, 30, 36, 42, 48, 54],
    lignesSelecteur: [[100, 52], [100, 40], [85, 46], [75, 34], [60, 42], [50, 28]],
  },
  // Bleu franc : du bleu ciel au bleu roi, sans virer au violet ni au turquoise.
  bleu: {
    hueMin: 200, hueSpan: 40, satMin: 60, satMax: 100, lightMin: 30, lightMax: 62,
    seuil: 4, deltaSombre: 14,
    hues: pas(200, 240, 2), sats: [60, 72, 86, 100], lights: [32, 38, 44, 50, 56, 62],
    lignesSelecteur: [[100, 58], [100, 46], [86, 52], [75, 40], [65, 48], [60, 34]],
  },
  // Rouge franc : du carmin au rouge vif, sans virer au marron ni a l'orange.
  rouge: {
    hueMin: 348, hueSpan: 20, satMin: 65, satMax: 100, lightMin: 34, lightMax: 58,
    seuil: 3.5, deltaSombre: 14,
    hues: pas(348, 368, 1), sats: [65, 75, 85, 100], lights: [34, 38, 42, 46, 50, 54, 58],
    lignesSelecteur: [[100, 54], [100, 44], [85, 50], [75, 40], [65, 46], [70, 36]],
  },
  // Rose : de la fuchsia au rose bonbon, clair pour ne jamais tirer sur le bordeaux.
  rose: {
    hueMin: 318, hueSpan: 20, satMin: 60, satMax: 100, lightMin: 48, lightMax: 74,
    seuil: 4, deltaSombre: 6,
    hues: pas(318, 338, 1), sats: [60, 72, 86, 100], lights: [48, 53, 58, 63, 68, 74],
    lignesSelecteur: [[100, 70], [100, 58], [86, 64], [75, 52], [65, 60], [60, 50]],
  },
  // Gris : quasi neutres (teinte tres discrete) qui se distinguent surtout par leur clarte.
  gris: {
    hueMin: 0, hueSpan: 360, satMin: 0, satMax: 6, lightMin: 26, lightMax: 74,
    seuil: 3, deltaSombre: 8,
    hues: pas(0, 330, 30), sats: [0, 3, 6], lights: pas(26, 74, 2),
    lignesSelecteur: [[6, 32], [6, 44], [6, 56], [6, 68], [3, 38], [3, 50], [3, 62], [0, 46]],
  },
};

export const seuilFamille = (famille: Famille) => FAMILLES[famille].seuil;

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

type Hsl = { h: number; s: number; l: number };

function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return lig - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

export function hslToHex(hsl: Hsl): string {
  return (
    "#" +
    hslToRgb(hsl)
      .map((c) => Math.round(c * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

const HEX = /^#[0-9a-f]{6}$/;

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toOklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Distance perceptuelle entre deux couleurs hex (0 = identiques). */
export function distanceCouleur(a: string, b: string): number {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function normaliserHex(valeur: string): string {
  return valeur.trim().toLowerCase();
}

/** Vrai si `hex` est un #rrggbb dans la plage de la famille (tolere l'arrondi 8 bits). */
export function estCouleurValide(famille: Famille, hex: string): boolean {
  if (!HEX.test(hex)) return false;
  const c = FAMILLES[famille];
  const { h, s, l } = hexToHsl(hex);
  const dansTeinte =
    c.hueSpan >= 360 || (h - c.hueMin + 720) % 360 <= c.hueSpan + 1.5 || (c.hueMin - h + 720) % 360 <= 1.5;
  return (
    dansTeinte &&
    s >= c.satMin - 1.5 &&
    s <= c.satMax + 1.5 &&
    l >= c.lightMin - 1.5 &&
    l <= c.lightMax + 1.5
  );
}

/** Premiere couleur de `autres` identique ou trop proche de `hex`, sinon undefined. */
export function couleurTropProche(
  famille: Famille,
  hex: string,
  autres: readonly string[],
): string | undefined {
  const seuil = FAMILLES[famille].seuil;
  return autres.find((autre) => distanceCouleur(hex, autre) < seuil);
}

// ---------------------------------------------------------------------------
// Attribution automatique
// ---------------------------------------------------------------------------

function hash(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const reservoirs = new Map<Famille, string[]>();

function reservoir(famille: Famille): string[] {
  let r = reservoirs.get(famille);
  if (!r) {
    const c = FAMILLES[famille];
    const set = new Set<string>();
    for (const h of c.hues) for (const s of c.sats) for (const l of c.lights) set.add(hslToHex({ h, s, l }));
    r = [...set];
    reservoirs.set(famille, r);
  }
  return r;
}

/**
 * Choisit la couleur de la famille la plus eloignee de toutes celles deja
 * prises (les elements voisins se distinguent ainsi au maximum). `graine`
 * departage quand rien n'est pris. Si plus aucune couleur n'est a distance
 * >= seuil, renvoie quand meme la plus eloignee : la creation d'un element ne
 * doit jamais echouer pour une couleur.
 */
export function attribuerCouleur(famille: Famille, prises: readonly string[], graine: string): string {
  const candidats = reservoir(famille);
  if (prises.length === 0) return candidats[hash(graine) % candidats.length];

  const oklabPrises = prises.map(toOklab);
  let meilleur = candidats[0];
  let meilleureDistance = -1;
  for (const candidat of candidats) {
    const c = toOklab(candidat);
    let min = Infinity;
    for (const p of oklabPrises) {
      min = Math.min(min, Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) * 100);
    }
    if (min > meilleureDistance) {
      meilleureDistance = min;
      meilleur = candidat;
    }
  }
  return meilleur;
}

/** Couleur de secours (non garantie unique) pour un element sans couleur enregistree. */
export function couleurParDefaut(famille: Famille, id: string): string {
  const c = FAMILLES[famille];
  const h = hash(id);
  return hslToHex({
    h: c.hueMin + (h % Math.max(1, Math.round(c.hueSpan))),
    s: Math.min(c.satMax, (c.satMin + c.satMax) / 2 + 15),
    l: (c.lightMin + c.lightMax) / 2,
  });
}

// ---------------------------------------------------------------------------
// Selecteur : grille de couleurs proposees
// ---------------------------------------------------------------------------

/** Lignes (saturation, luminosite) x 18 teintes reparties sur la plage de la famille. */
export function grilleSelecteur(famille: Famille): string[][] {
  const c = FAMILLES[famille];
  const colonnes = 18;
  const pasTeinte = c.hueSpan >= 360 ? 360 / colonnes : c.hueSpan / (colonnes - 1);
  return c.lignesSelecteur.map(([s, l]) => {
    const ligne = new Set<string>();
    for (let i = 0; i < colonnes; i++) ligne.add(hslToHex({ h: c.hueMin + i * pasTeinte, s, l }));
    return [...ligne];
  });
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

const ENCRE_CLAIRE = "#ffffff";
const ENCRE_SOMBRE = "#0a1128";

function encreSur(hex: string) {
  const L = luminance(hex);
  const contrasteBlanc = 1.05 / (L + 0.05);
  const contrasteSombre = (L + 0.05) / (luminance(ENCRE_SOMBRE) + 0.05);
  return contrasteBlanc >= contrasteSombre ? ENCRE_CLAIRE : ENCRE_SOMBRE;
}

/** Variante eclaircie pour le theme sombre : meme teinte, meme decalage pour toute la famille. */
export function couleurPourThemeSombre(famille: Famille, hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex({ h, s, l: Math.min(l + FAMILLES[famille].deltaSombre, 88) });
}

/**
 * Variables CSS consommees par `.item-color` (globals.css).
 * `couleur` null => couleur par defaut derivee de l'id (elements pas encore migres).
 */
export function styleCouleur(
  famille: Famille,
  couleur: string | null | undefined,
  id: string,
): CSSProperties {
  const clair = couleur && HEX.test(couleur) ? couleur : couleurParDefaut(famille, id);
  const sombre = couleurPourThemeSombre(famille, clair);
  return {
    "--cg-light": clair,
    "--cg-dark": sombre,
    "--cg-ink-light": encreSur(clair),
    "--cg-ink-dark": encreSur(sombre),
  } as CSSProperties;
}
