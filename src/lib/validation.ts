import { z } from "zod";

/** Texte optionnel : chaîne vide ou absente -> null. */
export const optText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

/** E-mail optionnel : chaîne vide ou absente -> null. */
export const optEmail = z
  .union([z.literal(""), z.string().trim().max(200).email("E-mail invalide")])
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null));

/** Identifiant de clé étrangère optionnel : "" -> null. */
export const optUuid = z
  .union([z.literal(""), z.string().uuid()])
  .optional()
  .transform((v) => (v ? v : null));

/** Matricule fiscal : espaces retirés, majuscules. */
export const optMatricule = z
  .string()
  .trim()
  .max(30)
  .optional()
  .transform((v) => (v ? v.replace(/\s+/g, "").toUpperCase() : null));

/** Case à cocher HTML : "on" / "true" -> true. */
export const formBool = (value: FormDataEntryValue | null) =>
  value === "on" || value === "true";
