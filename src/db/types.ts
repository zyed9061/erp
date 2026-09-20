import type { PgDatabase } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Type commun à node-postgres (production) et PGlite (tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;
