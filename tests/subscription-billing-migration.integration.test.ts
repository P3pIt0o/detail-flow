import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Client } from "pg"

/**
 * Test d'intégration RÉEL du script de migration Stripe Billing (LOT S1 / S1.1).
 *
 * Exécute `scripts/subscription-billing-migration.sql` sur une base PostgreSQL
 * réelle, mais dans un SCHÉMA TEMPORAIRE ISOLÉ (jamais `public`, jamais la
 * table `companies` de production). Le schéma est supprimé en fin de test.
 *
 * Le script référence `"companies"` sans qualifier le schéma : on positionne
 * `search_path` sur le schéma temporaire pour que toutes les commandes (ALTER,
 * CREATE INDEX, CHECK) s'appliquent à la table jetable et à elle seule.
 *
 * Si aucune base n'est disponible (pas de DATABASE_URL/NEON_DATABASE_URL), le
 * test est ignoré plutôt que d'échouer — il n'invente aucune connexion.
 */

const connectionString = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL
const MIGRATION_SQL = readFileSync(
  resolve(process.cwd(), "scripts/subscription-billing-migration.sql"),
  "utf8",
)

// Schéma jetable, nom unique pour éviter toute collision entre exécutions.
const TEST_SCHEMA = `df_migtest_${Date.now().toString(36)}`

describe.skipIf(!connectionString)("subscription-billing migration (integration réelle)", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString })
    await client.connect()
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`)
    // Toutes les requêtes de cette connexion visent le schéma jetable.
    await client.query(`SET search_path TO "${TEST_SCHEMA}"`)

    // 1) Schéma ANCIEN : une table `companies` SANS aucune colonne Billing,
    //    avec un tenant historique (licence PRO) à préserver.
    await client.query(`
      CREATE TABLE "companies" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL,
        "licensePlan" text NOT NULL DEFAULT 'PRO'
      )
    `)
    await client.query(
      `INSERT INTO "companies" ("id", "name", "licensePlan") VALUES ($1, $2, $3)`,
      ["tenant_legacy", "Garage Historique", "PRO"],
    )
  })

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
      await client.end()
    }
  })

  async function columns(): Promise<Set<string>> {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'companies'`,
      [TEST_SCHEMA],
    )
    return new Set(rows.map((r) => r.column_name as string))
  }

  it("le schéma de départ ne contient AUCUNE colonne Billing", async () => {
    const cols = await columns()
    expect(cols.has("billingMode")).toBe(false)
    expect(cols.has("stripeCustomerId")).toBe(false)
    expect(cols.has("subscriptionStatus")).toBe(false)
  })

  it("après migration : les 10 colonnes Billing existent", async () => {
    await client.query(MIGRATION_SQL)
    const cols = await columns()
    for (const c of [
      "billingMode",
      "stripeCustomerId",
      "stripeSubscriptionId",
      "subscriptionStatus",
      "subscriptionPriceId",
      "currentPeriodEnd",
      "subscriptionStartedAt",
      "continuousSubscriptionStartedAt",
      "cancelAtPeriodEnd",
      "subscriptionCanceledAt",
    ]) {
      expect(cols.has(c), `colonne manquante: ${c}`).toBe(true)
    }
  })

  it("le tenant historique est préservé avec des defaults sûrs", async () => {
    const { rows } = await client.query(
      `SELECT "licensePlan", "billingMode", "cancelAtPeriodEnd",
              "stripeCustomerId", "stripeSubscriptionId", "subscriptionStatus",
              "currentPeriodEnd", "continuousSubscriptionStartedAt"
       FROM "companies" WHERE "id" = 'tenant_legacy'`,
    )
    expect(rows).toHaveLength(1)
    const row = rows[0]
    // Licence intacte (les droits restent pilotés par licensePlan, pas billingMode).
    expect(row.licensePlan).toBe("PRO")
    // Defaults sûrs.
    expect(row.billingMode).toBe("free")
    expect(row.cancelAtPeriodEnd).toBe(false)
    // Le reste des champs Billing reste NULL.
    expect(row.stripeCustomerId).toBeNull()
    expect(row.stripeSubscriptionId).toBeNull()
    expect(row.subscriptionStatus).toBeNull()
    expect(row.currentPeriodEnd).toBeNull()
    expect(row.continuousSubscriptionStartedAt).toBeNull()
  })

  it("les index attendus existent (unicité partielle + lecture)", async () => {
    const { rows } = await client.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'companies'`,
      [TEST_SCHEMA],
    )
    const idx = new Set(rows.map((r) => r.indexname as string))
    expect(idx.has("companies_stripeCustomerId_key")).toBe(true)
    expect(idx.has("companies_stripeSubscriptionId_key")).toBe(true)
    expect(idx.has("companies_subscriptionStatus_idx")).toBe(true)
    expect(idx.has("companies_billingMode_idx")).toBe(true)
  })

  it("l'unicité Stripe ignore les NULL mais bloque les doublons non-NULL", async () => {
    // Plusieurs lignes avec stripeCustomerId NULL : autorisé (index partiel).
    await client.query(
      `INSERT INTO "companies" ("id", "name", "licensePlan") VALUES
        ('t_null_1', 'A', 'FREE'), ('t_null_2', 'B', 'FREE')`,
    )
    // Deux fois le même identifiant non-NULL : refusé.
    await client.query(
      `UPDATE "companies" SET "stripeCustomerId" = 'cus_dup' WHERE "id" = 't_null_1'`,
    )
    await expect(
      client.query(`UPDATE "companies" SET "stripeCustomerId" = 'cus_dup' WHERE "id" = 't_null_2'`),
    ).rejects.toThrow()
  })

  it("CHECK billingMode : une valeur arbitraire est refusée par la DB", async () => {
    await expect(
      client.query(
        `INSERT INTO "companies" ("id", "name", "licensePlan", "billingMode")
         VALUES ('t_bad_mode', 'X', 'FREE', 'invalid')`,
      ),
    ).rejects.toThrow()
  })

  it("CHECK subscriptionStatus : NULL autorisé, valeur arbitraire refusée", async () => {
    // NULL explicite : accepté.
    await client.query(
      `INSERT INTO "companies" ("id", "name", "licensePlan", "subscriptionStatus")
       VALUES ('t_status_null', 'Y', 'FREE', NULL)`,
    )
    // Valeur hors énumération : refusée.
    await expect(
      client.query(
        `INSERT INTO "companies" ("id", "name", "licensePlan", "subscriptionStatus")
         VALUES ('t_bad_status', 'Z', 'FREE', 'invalid')`,
      ),
    ).rejects.toThrow()
  })

  it("est IDEMPOTENTE : seconde exécution sans erreur ni perte de données", async () => {
    await expect(client.query(MIGRATION_SQL)).resolves.toBeDefined()
    // Le tenant historique est toujours là et inchangé.
    const { rows } = await client.query(
      `SELECT "billingMode", "licensePlan" FROM "companies" WHERE "id" = 'tenant_legacy'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].billingMode).toBe("free")
    expect(rows[0].licensePlan).toBe("PRO")
  })
})
