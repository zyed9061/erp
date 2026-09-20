import { z } from "zod";

export const clientSchema = z.object({
  type: z.enum(["PARTICULIER", "ENTREPRISE"]),
  nom: z.string().min(1, "Le nom est requis"),
  matriculeFiscal: z.string().optional().or(z.literal("")),
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  telephone: z.string().optional().or(z.literal("")),
  adresse: z.string().optional().or(z.literal("")),
  ville: z.string().optional().or(z.literal("")),
  codePostal: z.string().optional().or(z.literal("")),
  pays: z.string().min(1).default("Tunisie"),
  notes: z.string().optional().or(z.literal("")),
});

export type ClientInput = z.infer<typeof clientSchema>;
