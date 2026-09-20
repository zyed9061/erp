import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import { TAX_BASES, TAX_REGIMES, companySettings, type CompanySettings } from "@/db/schema";
import { audit } from "./audit";
import type { Actor } from "./errors";
import { amountSchema } from "./money";
import { optEmail, optMatricule, optText } from "./validation";

export const companySchema = z.object({
  legalName: z.string().trim().min(1, "Raison sociale requise").max(200),
  tradeName: optText(200),
  matriculeFiscal: optMatricule,
  legalForm: optText(60),
  capital: z
    .union([z.literal(""), amountSchema])
    .optional()
    .transform((v) => (v ? v : null)),
  address: optText(300),
  city: optText(100),
  postalCode: optText(20),
  phone: optText(40),
  email: optEmail,
  website: optText(200),
  bankName: optText(100),
  rib: optText(40),
  taxRegime: z.enum(TAX_REGIMES),
  vatRegistered: z.boolean(),
  stampDutyEnabled: z.boolean(),
  stampDutyAmount: amountSchema,
  withholdingBase: z.enum(TAX_BASES),
  withholdingThreshold: amountSchema,
});

export async function getCompany(db: Db): Promise<CompanySettings> {
  const [row] = await db.select().from(companySettings).where(eq(companySettings.id, 1));
  if (!row) throw new Error("Paramètres de la société absents (migration non appliquée ?)");
  return row;
}

export async function updateCompany(db: Db, actor: Actor, input: z.input<typeof companySchema>) {
  const data = companySchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(companySettings).where(eq(companySettings.id, 1)).for("update");
    const [after] = await tx
      .update(companySettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companySettings.id, 1))
      .returning();
    if (!after) throw new Error("Mise à jour de la société échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "company.update", entity: "company", entityId: "1", before, after,
    });
    return after;
  });
}
