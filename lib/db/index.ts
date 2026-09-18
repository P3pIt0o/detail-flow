import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

/**
 * Pool PostgreSQL partagé (Neon).
 * Une seule connexion pour toute l'application : Drizzle (requêtes app) et,
 * plus tard, Better Auth (espace client) utiliseront ce même Pool.
 */
export const pool = new Pool({
  // `DATABASE_URL` reste la source principale (production/preview). Repli sur
  // `NEON_DATABASE_URL` (même base Neon, URL poolée fournie par l'intégration)
  // lorsque `DATABASE_URL` n'est pas injecté dans l'environnement : sans ce
  // repli, `pg` tente localhost:5432 et échoue (ECONNREFUSED).
  connectionString: process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL,
})

export const db = drizzle(pool, { schema })
