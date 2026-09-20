import { z } from "zod";

export const ligneSchema = z.object({
  produitId: z.string().optional().nullable(),
  designation: z.string().min(1, "La designation est requise"),
  description: z.string().optional().or(z.literal("")),
  quantite: z.coerce.number().positive("La quantite doit etre positive"),
  prixUnitaireHT: z.coerce.number().nonnegative("Le prix doit etre positif"),
  remisePct: z.coerce.number().min(0).max(100).default(0),
  tauxTva: z.coerce.number().min(0).max(100),
});

export type LigneInput = z.infer<typeof ligneSchema>;

export const devisSchema = z.object({
  clientId: z.string().min(1, "Le client est requis"),
  dateEmission: z.string().min(1),
  dateValidite: z.string().optional().or(z.literal("")),
  conditions: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  lignes: z.array(ligneSchema).min(1, "Au moins une ligne est requise"),
});

export type DevisInput = z.infer<typeof devisSchema>;

export const factureSchema = z.object({
  clientId: z.string().min(1, "Le client est requis"),
  dateEmission: z.string().min(1),
  dateEcheance: z.string().optional().or(z.literal("")),
  conditionsPaiement: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  appliquerTimbreFiscal: z.coerce.boolean().default(true),
  lignes: z.array(ligneSchema).min(1, "Au moins une ligne est requise"),
});

export type FactureInput = z.infer<typeof factureSchema>;

export const avoirSchema = z.object({
  factureOrigineId: z.string().min(1, "La facture d'origine est requise"),
  motif: z.string().optional().or(z.literal("")),
  lignes: z.array(ligneSchema).min(1, "Au moins une ligne est requise"),
});

export type AvoirInput = z.infer<typeof avoirSchema>;

export const paiementSchema = z.object({
  factureId: z.string().min(1),
  datePaiement: z.string().min(1),
  montant: z.coerce.number().positive("Le montant doit etre positif"),
  modePaiement: z.enum(["VIREMENT", "CHEQUE", "ESPECES", "CARTE", "AUTRE"]),
  reference: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export type PaiementInput = z.infer<typeof paiementSchema>;
