import { describe, it, expect, vi } from "vitest"

/**
 * HOTFIX — détection robuste « relation inexistante » (42P01).
 *
 * Drizzle encapsule l'erreur PostgreSQL native dans une chaîne `cause` (parfois
 * imbriquée). Le détecteur `isMissingRelationError` doit parcourir cette chaîne,
 * et les LECTURES CRM doivent rester TOLÉRANTES quand les tables `leads` /
 * `lead_activities` ne sont pas encore présentes :
 *  - `countDueFollowUps` renvoie 0 (le dashboard ne casse jamais) ;
 *  - `getLeadDetail` lève `LeadsSchemaNotReadyError` même quand seule
 *    `lead_activities` manque (la fiche affiche l'état « en cours d'init. »).
 *
 * Ces tests mockent `@/lib/db` : aucune écriture DB, aucun accès réseau.
 */

vi.mock("server-only", () => ({}))

/** Erreur PostgreSQL native (relation inexistante) telle que renvoyée par pg. */
function pgMissingRelation(): Error {
  return Object.assign(new Error('relation "leads" does not exist'), { code: "42P01" })
}

/** Emballage à la Drizzle : l'erreur pg vit dans `cause`. */
function drizzleWrapped(cause: unknown): Error {
  return Object.assign(new Error("Failed query"), { cause })
}

/**
 * Constructeur de mock `db` minimal : chaque appel `.from(table)` fixe le
 * comportement de la requête (résoudre une valeur ou lever) selon la table
 * fournie. Toutes les autres méthodes chaînables renvoient le même builder, qui
 * est « thenable » pour être `await`-able comme une requête Drizzle.
 */
function makeDb(resolveByTable: (table: unknown) => () => unknown) {
  function builder(resolve: () => unknown) {
    const chain: Record<string, unknown> = {}
    const same = () => chain
    chain.from = (table: unknown) => builder(resolveByTable(table))
    for (const m of ["where", "groupBy", "orderBy", "limit", "innerJoin", "leftJoin", "select"]) {
      chain[m] = same
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => resolve())
        .then(onF, onR)
    chain.catch = (onR: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => resolve())
        .catch(onR)
    return chain
  }
  return {
    select: () =>
      builder(() => {
        throw new Error("select() sans from() dans le mock")
      }),
  }
}

describe("isMissingRelationError — parcours de la chaîne cause", () => {
  it("code direct 42P01 => true", async () => {
    const { isMissingRelationError } = await import("@/lib/leads/server")
    expect(isMissingRelationError(pgMissingRelation())).toBe(true)
  })

  it("cause.code 42P01 => true", async () => {
    const { isMissingRelationError } = await import("@/lib/leads/server")
    expect(isMissingRelationError(drizzleWrapped(pgMissingRelation()))).toBe(true)
  })

  it("cause.cause.code 42P01 => true", async () => {
    const { isMissingRelationError } = await import("@/lib/leads/server")
    expect(isMissingRelationError(drizzleWrapped(drizzleWrapped(pgMissingRelation())))).toBe(true)
  })

  it("autre code PostgreSQL => false", async () => {
    const { isMissingRelationError } = await import("@/lib/leads/server")
    const other = Object.assign(new Error("undefined_column"), { code: "42703" })
    expect(isMissingRelationError(other)).toBe(false)
    expect(isMissingRelationError(drizzleWrapped(other))).toBe(false)
  })

  it("objet sans code => false", async () => {
    const { isMissingRelationError } = await import("@/lib/leads/server")
    expect(isMissingRelationError(new Error("boom"))).toBe(false)
    expect(isMissingRelationError({ message: "x" })).toBe(false)
    expect(isMissingRelationError(null)).toBe(false)
    expect(isMissingRelationError(undefined)).toBe(false)
  })

  it("chaîne cyclique => false, sans boucle infinie", async () => {
    const { isMissingRelationError } = await import("@/lib/leads/server")
    const a: { cause?: unknown } = {}
    a.cause = a
    expect(isMissingRelationError(a)).toBe(false)
  })
})

describe("tolérance schéma CRM absent (db mockée)", () => {
  it("countDueFollowUps : DrizzleQueryError dont cause.code=42P01 => renvoie 0", async () => {
    vi.resetModules()
    const schema = await import("@/lib/db/schema")
    vi.doMock("@/lib/db", () => ({
      db: makeDb(() => () => {
        // Toujours « table absente », emballée par Drizzle.
        throw drizzleWrapped(pgMissingRelation())
      }),
    }))
    const { countDueFollowUps } = await import("@/lib/leads/server")
    await expect(countDueFollowUps(1, new Date("2026-02-15T12:00:00Z"))).resolves.toBe(0)
    void schema
    vi.doUnmock("@/lib/db")
  })

  it("getLeadDetail : `leads` présent mais `lead_activities` absent => LeadsSchemaNotReadyError", async () => {
    vi.resetModules()
    const schema = await import("@/lib/db/schema")
    vi.doMock("@/lib/db", () => ({
      db: makeDb((table) => {
        if (table === schema.leadActivities) {
          return () => {
            throw drizzleWrapped(pgMissingRelation())
          }
        }
        // `leads` existe : renvoie une ligne (le lead est trouvé).
        return () => [{ id: 42, companyId: 1 }]
      }),
    }))
    const { getLeadDetail, LeadsSchemaNotReadyError, isLeadsSchemaNotReady } = await import(
      "@/lib/leads/server"
    )
    await expect(getLeadDetail(1, 42)).rejects.toBeInstanceOf(LeadsSchemaNotReadyError)
    const caught = await getLeadDetail(1, 42).catch((e) => e)
    expect(isLeadsSchemaNotReady(caught)).toBe(true)
    vi.doUnmock("@/lib/db")
  })
})
