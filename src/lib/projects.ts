import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import {
  PROJECT_STATUSES, customers, invoices, projectHoldbackReleases, projectLines, projectSituationLines,
  projectSituations, projects, taxRates, type Invoice, type Project, type ProjectStatus,
} from "@/db/schema";
import { audit } from "./audit";
import { todayTunis } from "./dates";
import { ServiceError, type Actor } from "./errors";
import { calculateInvoice } from "./invoicing/calc";
import { createDraftFromResolved, dateString, loadContext, type ResolvedLine, type Tx } from "./invoicing/invoices";
import { amountSchema, divRound, formatPercent, fromMilli, toMilli } from "./money";
import { percentSchema } from "./taxes";
import { optText } from "./validation";

// ---------------------------------------------------------------------------
// Chantier et bordereau
// ---------------------------------------------------------------------------

const positive = amountSchema.refine((v) => toMilli(v) > 0n, "La quantité doit être supérieure à 0");

export const projectLineSchema = z.object({
  description: z.string().trim().min(1, "Désignation requise").max(500),
  unit: z.string().trim().min(1, "Unité requise").max(30),
  quantity: positive,
  unitPrice: amountSchema,
  tvaRateId: z.string().uuid("Choisissez un taux de TVA"),
});

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, "Nom du chantier requis").max(200),
  description: optText(2000),
  customerId: z.string().uuid("Choisissez un client"),
  holdbackPercent: percentSchema.prefault("0"),
  lines: z.array(projectLineSchema).min(1, "Le bordereau doit contenir au moins un poste").max(300),
});
export type ProjectInput = z.input<typeof projectInputSchema>;

async function resolveProjectLines(tx: Tx, lines: z.output<typeof projectLineSchema>[]) {
  const ids = [...new Set(lines.map((l) => l.tvaRateId))];
  const rates = await tx.select().from(taxRates);
  const byId = new Map(rates.filter((r) => ids.includes(r.id)).map((r) => [r.id, r]));
  return lines.map((l, i) => {
    const rate = byId.get(l.tvaRateId);
    if (!rate || rate.kind !== "tva") throw new ServiceError(`Poste ${i + 1} : taux de TVA invalide`);
    if (!rate.isActive) throw new ServiceError(`Poste ${i + 1} : le taux « ${rate.label} » est inactif`);
    return {
      position: i + 1, description: l.description, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice,
      tvaCode: rate.code, tvaRate: rate.rate,
    };
  });
}

export async function createProject(db: Db, actor: Actor, input: ProjectInput): Promise<Project> {
  const data = projectInputSchema.parse(input);
  return db.transaction(async (tx) => {
    const [customer] = await tx.select().from(customers).where(eq(customers.id, data.customerId));
    if (!customer) throw new ServiceError("Client introuvable");
    if (!customer.isActive) throw new ServiceError("Ce client est désactivé");
    const lines = await resolveProjectLines(tx, data.lines);
    const [created] = await tx
      .insert(projects)
      .values({
        name: data.name, description: data.description, customerId: data.customerId,
        holdbackPercent: data.holdbackPercent, createdBy: actor.id,
      })
      .returning();
    if (!created) throw new Error("Insertion du chantier échouée");
    await tx.insert(projectLines).values(lines.map((l) => ({ ...l, projectId: created.id })));
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "project.create", entity: "project", entityId: created.id, after: { ...created, lineCount: lines.length },
    });
    return created;
  });
}

/** Le bordereau ne se modifie plus dès qu'une situation existe (trigger en base) ; la retenue reste ajustable pour les suivantes. */
export async function updateProject(db: Db, actor: Actor, id: string, input: ProjectInput): Promise<Project> {
  const data = projectInputSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(projects).where(eq(projects.id, id)).for("update");
    if (!before) throw new ServiceError("Chantier introuvable");
    if (before.status !== "active") throw new ServiceError("Ce chantier n'est plus actif");
    const [hasSituation] = await tx.select({ id: projectSituations.id }).from(projectSituations).where(eq(projectSituations.projectId, id)).limit(1);
    if (hasSituation) {
      if (data.customerId !== before.customerId) throw new ServiceError("Le client ne peut plus changer : des situations existent");
      const [after] = await tx.update(projects)
        .set({ name: data.name, description: data.description, holdbackPercent: data.holdbackPercent, updatedAt: new Date() })
        .where(eq(projects.id, id)).returning();
      await audit(tx, { userId: actor.id, userEmail: actor.email, ip: actor.ip, action: "project.update", entity: "project", entityId: id, before, after });
      return after!;
    }
    const lines = await resolveProjectLines(tx, data.lines);
    await tx.delete(projectLines).where(eq(projectLines.projectId, id));
    const [after] = await tx.update(projects)
      .set({
        name: data.name, description: data.description, customerId: data.customerId,
        holdbackPercent: data.holdbackPercent, updatedAt: new Date(),
      })
      .where(eq(projects.id, id)).returning();
    await tx.insert(projectLines).values(lines.map((l) => ({ ...l, projectId: id })));
    await audit(tx, { userId: actor.id, userEmail: actor.email, ip: actor.ip, action: "project.update", entity: "project", entityId: id, before, after });
    return after!;
  });
}

export const projectMetaSchema = z.object({
  name: z.string().trim().min(1, "Nom du chantier requis").max(200),
  description: optText(2000),
  holdbackPercent: percentSchema.prefault("0"),
});

/** Nom, description et taux de retenue de garantie (pour les situations à venir) : modifiables à tout moment. */
export async function updateProjectMeta(db: Db, actor: Actor, id: string, input: z.input<typeof projectMetaSchema>): Promise<Project> {
  const data = projectMetaSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(projects).where(eq(projects.id, id)).for("update");
    if (!before) throw new ServiceError("Chantier introuvable");
    const [after] = await tx.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    await audit(tx, { userId: actor.id, userEmail: actor.email, ip: actor.ip, action: "project.update", entity: "project", entityId: id, before, after });
    return after!;
  });
}

export async function setProjectStatus(db: Db, actor: Actor, id: string, status: ProjectStatus): Promise<Project> {
  z.enum(PROJECT_STATUSES).parse(status);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(projects).where(eq(projects.id, id)).for("update");
    if (!before) throw new ServiceError("Chantier introuvable");
    const [after] = await tx.update(projects).set({ status, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    await audit(tx, { userId: actor.id, userEmail: actor.email, ip: actor.ip, action: "project.status", entity: "project", entityId: id, before: { status: before.status }, after: { status } });
    return after!;
  });
}

// ---------------------------------------------------------------------------
// Situations de travaux
// ---------------------------------------------------------------------------

export const situationSchema = z.object({
  issueDate: dateString.optional(),
  /** Avancement CUMULÉ (0 à 100 %) par poste ; un poste omis garde son avancement précédent. */
  progress: z.array(z.object({ projectLineId: z.string().uuid(), cumulativePercent: percentSchema })).min(1, "Indiquez au moins un avancement"),
});
export type SituationInput = z.input<typeof situationSchema>;

/** Quantité cumulée = quantité du marché × avancement. Arrondie une fois, sur le CUMUL (jamais sur le delta) :
 *  la somme des situations retombe alors exactement sur la quantité du marché à 100 %. */
const cumulativeQty = (qty: string, percent: string) => divRound(toMilli(qty) * toMilli(percent), 100000n);

/**
 * Crée la situation suivante et son brouillon de facture : chaque poste est facturé pour l'avancement
 * ajouté depuis la situation précédente. La retenue de garantie du chantier s'applique sur le TTC.
 */
export async function createSituation(
  db: Db, actor: Actor, projectId: string, input: SituationInput,
): Promise<{ invoice: Invoice; number: number }> {
  const data = situationSchema.parse(input);
  const issueDate = data.issueDate ?? todayTunis();

  return db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).for("update");
    if (!project) throw new ServiceError("Chantier introuvable");
    if (project.status !== "active") throw new ServiceError("Ce chantier n'est plus actif");
    const lines = await tx.select().from(projectLines).where(eq(projectLines.projectId, projectId)).orderBy(asc(projectLines.position));

    const [last] = await tx.select().from(projectSituations).where(eq(projectSituations.projectId, projectId)).orderBy(desc(projectSituations.number)).limit(1);
    const previous = new Map<string, { percent: string; quantity: string }>();
    if (last) {
      const [inv] = await tx.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, last.invoiceId));
      if (inv?.status !== "validated") {
        throw new ServiceError(`Validez ou supprimez la situation n° ${last.number} (brouillon) avant d'en créer une nouvelle`);
      }
      const prev = await tx.select().from(projectSituationLines).where(eq(projectSituationLines.situationId, last.id));
      for (const p of prev) previous.set(p.projectLineId, { percent: p.cumulativePercent, quantity: p.cumulativeQuantity });
    }

    const requested = new Map<string, string>();
    for (const p of data.progress) {
      if (!lines.some((l) => l.id === p.projectLineId)) throw new ServiceError("Poste inconnu pour ce chantier");
      requested.set(p.projectLineId, p.cumulativePercent);
    }

    const number = (last?.number ?? 0) + 1;
    const ctx = await loadContext(tx, project.customerId);
    if (!ctx.customer.isActive) throw new ServiceError("Ce client est désactivé");

    const resolved: ResolvedLine[] = [];
    const snapshot: { projectLineId: string; cumulativePercent: string; cumulativeQuantity: string }[] = [];
    for (const l of lines) {
      const prev = previous.get(l.id) ?? { percent: "0.000", quantity: "0.000" };
      const percent = requested.get(l.id) ?? prev.percent;
      if (toMilli(percent) < toMilli(prev.percent)) {
        throw new ServiceError(`Poste « ${l.description} » : l'avancement (${formatPercent(percent)}) ne peut pas être inférieur au précédent (${formatPercent(prev.percent)})`);
      }
      const cumQty = fromMilli(cumulativeQty(l.quantity, percent));
      snapshot.push({ projectLineId: l.id, cumulativePercent: percent, cumulativeQuantity: cumQty });
      const delta = toMilli(cumQty) - toMilli(prev.quantity);
      if (delta > 0n) {
        resolved.push({
          productId: null, description: `Situation n° ${number} — ${l.description}`, quantity: fromMilli(delta), unit: l.unit,
          unitPrice: l.unitPrice, discountPercent: "0.000",
          tvaCode: ctx.vatExempt ? "EXO" : l.tvaCode, tvaRate: ctx.vatExempt ? "0.000" : l.tvaRate, fodecRate: "0.000",
        });
      }
    }
    if (resolved.length === 0) throw new ServiceError("Aucun avancement à facturer : augmentez l'avancement d'au moins un poste");

    const invoice = await createDraftFromResolved(tx, actor, {
      kind: "invoice", customerId: project.customerId, lines: resolved, issueDate,
      reference: `${project.name} — situation n° ${number}`.slice(0, 100), projectId,
      guaranteeHoldbackRate: toMilli(project.holdbackPercent) > 0n ? project.holdbackPercent : null,
    });
    const [situation] = await tx.insert(projectSituations).values({ projectId, number, invoiceId: invoice.id, issueDate }).returning();
    await tx.insert(projectSituationLines).values(snapshot.map((s) => ({ ...s, situationId: situation!.id })));
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "project.situation", entity: "project", entityId: projectId, after: { number, invoiceId: invoice.id },
    });
    return { invoice, number };
  });
}

// ---------------------------------------------------------------------------
// Retenue de garantie
// ---------------------------------------------------------------------------

async function holdbackTotals(tx: Pick<Db, "select">, projectId: string) {
  const [held] = await tx
    .select({ total: sql<string>`coalesce(sum(${invoices.guaranteeHoldback}), 0)::text` })
    .from(invoices)
    .where(and(eq(invoices.projectId, projectId), eq(invoices.status, "validated")));
  const [released] = await tx
    .select({ total: sql<string>`coalesce(sum(${projectHoldbackReleases.amount}), 0)::text` })
    .from(projectHoldbackReleases)
    .where(eq(projectHoldbackReleases.projectId, projectId));
  const h = toMilli(held?.total ?? "0");
  const r = toMilli(released?.total ?? "0");
  return { held: fromMilli(h), released: fromMilli(r), remaining: fromMilli(h - r) };
}

export const releaseSchema = z.object({
  amount: amountSchema.refine((v) => toMilli(v) > 0n, "Le montant doit être supérieur à 0"),
  releasedOn: dateString.optional(),
  reference: optText(100),
  notes: optText(500),
});

/**
 * Enregistre la libération (encaissement) de tout ou partie de la retenue de garantie. Registre en ajout seul,
 * plafonné à la retenue restante. Le règlement reçu se saisit par ailleurs comme un paiement du client.
 */
export async function releaseHoldback(db: Db, actor: Actor, projectId: string, input: z.input<typeof releaseSchema>) {
  const data = releaseSchema.parse(input);
  return db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).for("update");
    if (!project) throw new ServiceError("Chantier introuvable");
    const totals = await holdbackTotals(tx, projectId);
    if (toMilli(data.amount) > toMilli(totals.remaining)) {
      throw new ServiceError(`La libération dépasse la retenue restante (${totals.remaining} DT)`);
    }
    const [created] = await tx.insert(projectHoldbackReleases)
      .values({ projectId, amount: data.amount, releasedOn: data.releasedOn ?? todayTunis(), reference: data.reference, notes: data.notes, createdBy: actor.id })
      .returning();
    await audit(tx, { userId: actor.id, userEmail: actor.email, ip: actor.ip, action: "project.holdback_release", entity: "project", entityId: projectId, after: created });
    return created!;
  });
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function getProject(db: Db, id: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return null;
  const [lines, [customer], situations, releases, holdback] = await Promise.all([
    db.select().from(projectLines).where(eq(projectLines.projectId, id)).orderBy(asc(projectLines.position)),
    db.select().from(customers).where(eq(customers.id, project.customerId)),
    db.select({ situation: projectSituations, invoice: invoices })
      .from(projectSituations)
      .innerJoin(invoices, eq(invoices.id, projectSituations.invoiceId))
      .where(eq(projectSituations.projectId, id))
      .orderBy(asc(projectSituations.number)),
    db.select().from(projectHoldbackReleases).where(eq(projectHoldbackReleases.projectId, id)).orderBy(asc(projectHoldbackReleases.releasedOn)),
    holdbackTotals(db, id),
  ]);

  // Avancement courant : celui de la dernière situation (validée ou brouillon).
  const lastSituation = situations.at(-1)?.situation;
  const current = new Map<string, { percent: string; quantity: string }>();
  if (lastSituation) {
    const rows = await db.select().from(projectSituationLines).where(eq(projectSituationLines.situationId, lastSituation.id));
    for (const r of rows) current.set(r.projectLineId, { percent: r.cumulativePercent, quantity: r.cumulativeQuantity });
  }
  const contract = calculateInvoice(lines.map((l) => ({
    quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: "0", tvaRate: l.tvaRate, fodecRate: "0",
  })), { stampDuty: "0", withholdingRate: null, withholdingBase: "ttc", withholdingThreshold: "0" });
  const doneHt = lines.reduce((sum, l) => {
    const q = current.get(l.id)?.quantity ?? "0.000";
    return sum + divRound(toMilli(q) * toMilli(l.unitPrice), 1000n);
  }, 0n);
  const contractHt = toMilli(contract.totals.ht);

  return {
    project, lines, customer: customer ?? null, situations, releases, holdback,
    progress: lines.map((l) => ({ line: l, percent: current.get(l.id)?.percent ?? "0.000", quantity: current.get(l.id)?.quantity ?? "0.000" })),
    contract: { ht: contract.totals.ht, tva: contract.totals.tva, ttc: contract.totals.ttc },
    doneHt: fromMilli(doneHt),
    overallPercent: contractHt > 0n ? fromMilli(divRound(doneHt * 100000n, contractHt)) : "0.000",
    canEditLines: situations.length === 0,
  };
}

export async function listProjects(
  db: Db, opts: { q?: string; status?: ProjectStatus; page?: number; pageSize?: number } = {},
) {
  const pageSize = opts.pageSize ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const like = opts.q?.trim() ? `%${opts.q.trim().replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = and(
    opts.status ? eq(projects.status, opts.status) : undefined,
    like ? or(ilike(projects.name, like), ilike(customers.name, like)) : undefined,
  );
  const [rows, [count]] = await Promise.all([
    db
      .select({
        project: projects, customerName: customers.name,
        contractHt: sql<string>`coalesce((select sum(round(l.quantity * l.unit_price, 3)) from project_lines l where l.project_id = ${projects.id}), 0)::text`,
        situations: sql<number>`(select count(*)::int from project_situations s where s.project_id = ${projects.id})`,
      })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .where(where)
      .orderBy(desc(projects.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(projects).innerJoin(customers, eq(customers.id, projects.customerId)).where(where),
  ]);
  return { rows, total: count?.n ?? 0, page, pageSize };
}
