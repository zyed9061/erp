import { z } from "zod";

export const produitSchema = z.object({
  reference: z.string().optional().or(z.literal("")),
  designation: z.string().min(1, "La designation est requise"),
  description: z.string().optional().or(z.literal("")),
  type: z.enum(["PRODUIT", "SERVICE"]),
  prixUnitaireHT: z.coerce.number().nonnegative("Le prix doit etre positif"),
  uniteMesure: z.string().min(1).default("unite"),
  tauxTva: z.coerce.number().min(0).max(100),
});

export type ProduitInput = z.infer<typeof produitSchema>;
