import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

/**
 * Pool PostgreSQL partagé (Neon).
 * Une seule connexion pour toute l'application : Drizzle (requêtes app) et,
 * plus tard, Better Auth (espace client) utiliseront ce même Pool.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export const db = drizzle(pool, { schema })
