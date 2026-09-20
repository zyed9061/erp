import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { auditLog } from "@/db/schema";
import type { Db } from "@/db/types";
import { audit } from "@/lib/audit";
import { createTestDb } from "./helpers";

/** Drizzle enveloppe l'erreur PostgreSQL : le message du trigger est dans `cause`. */
async function expectAppendOnlyError(promise: Promise<unknown>) {
  const err = (await promise.then(() => null, (e: unknown) => e)) as
    | (Error & { cause?: Error })
    | null;
  expect(err, "la requête aurait dû être refusée").not.toBeNull();
  expect(`${err?.message} ${err?.cause?.message}`).toMatch(/ajout seul/);
}

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await audit(db, { action: "test.create", entity: "demo", entityId: "1", after: { a: 1 } });
});
afterAll(() => close());

describe("journal d'audit en ajout seul", () => {
  it("accepte les insertions", async () => {
    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.after).toEqual({ a: 1 });
  });

  it("refuse UPDATE", async () => {
    await expectAppendOnlyError(db.execute(sql`UPDATE audit_log SET action = 'x'`));
  });

  it("refuse DELETE", async () => {
    await expectAppendOnlyError(db.execute(sql`DELETE FROM audit_log`));
  });

  it("refuse TRUNCATE", async () => {
    await expectAppendOnlyError(db.execute(sql`TRUNCATE audit_log`));
  });

  it("annule l'entrée d'audit avec la transaction qui la contient", async () => {
    await expect(
      db.transaction(async (tx) => {
        await audit(tx, { action: "test.rollback", entity: "demo" });
        throw new Error("échec métier");
      }),
    ).rejects.toThrow("échec métier");
    const rows = await db.select().from(auditLog);
    expect(rows.map((r) => r.action)).not.toContain("test.rollback");
  });
});
