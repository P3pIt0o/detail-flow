import { describe, it, expect, vi, beforeEach } from "vitest"
import { toValidDate } from "@/lib/leads/model"

/**
 * HOTFIX — robustesse des dates de la liste CRM (`/admin/leads`).
 *
 * `lastActivityAt` provient d'une expression SQL calculée (`GREATEST(...)`) et
 * `createdAt` du driver Postgres. Selon le chemin, ces valeurs peuvent arriver
 * en `Date`, en string (ISO ou format PostgreSQL « YYYY-MM-DD HH:MM:SS.ffffff »)
 * ou en `number`. Le type générique `sql<Date>` ne garantit PAS la conversion au
 * runtime : ces tests prouvent que `toValidDate` normalise chaque forme et que
 * `listLeads` ne lève jamais sur un timestamp string réel.
 */

describe("toValidDate — normalisation runtime", () => {
  it("accepte une Date valide", () => {
    const d = new Date("2026-09-21T11:26:18.000Z")
    expect(toValidDate(d)).toBe(d)
  })

  it("rejette une Date invalide", () => {
    expect(toValidDate(new Date("nope"))).toBeNull()
  })

  it("accepte un timestamp ISO string", () => {
    const r = toValidDate("2026-09-21T11:26:18.725Z")
    expect(r).toBeInstanceOf(Date)
    expect(r?.getTime()).toBe(Date.parse("2026-09-21T11:26:18.725Z"))
  })

  it("accepte un timestamp PostgreSQL string (sans T ni fuseau)", () => {
    const r = toValidDate("2026-09-21 11:26:18.725763")
    expect(r).toBeInstanceOf(Date)
    // Interprété en UTC de façon déterministe.
    expect(r?.toISOString()).toBe("2026-09-21T11:26:18.725Z")
  })

  it("accepte un timestamp PostgreSQL string sans fraction", () => {
    const r = toValidDate("2026-09-21 11:26:18")
    expect(r?.toISOString()).toBe("2026-09-21T11:26:18.000Z")
  })

  it("accepte un number timestamp", () => {
    const ms = Date.UTC(2026, 8, 21, 11, 26, 18)
    expect(toValidDate(ms)?.getTime()).toBe(ms)
  })

  it("renvoie null pour null / undefined", () => {
    expect(toValidDate(null)).toBeNull()
    expect(toValidDate(undefined)).toBeNull()
  })

  it("renvoie null pour une string invalide ou vide", () => {
    expect(toValidDate("pas une date")).toBeNull()
    expect(toValidDate("")).toBeNull()
    expect(toValidDate("   ")).toBeNull()
  })

  it("renvoie null pour un type non supporté", () => {
    expect(toValidDate({})).toBeNull()
    expect(toValidDate(true)).toBeNull()
    expect(toValidDate(Number.NaN)).toBeNull()
  })
})

/**
 * Régression « cas Spirit » : un lead réel dont createdAt / lastActivityAt sont
 * des strings PostgreSQL doit produire une liste rendue sans exception, avec
 * des dates valides. On mocke `@/lib/db` pour rester en test pur (aucune DB).
 */
vi.mock("@/lib/db", () => {
  const rows = [
    {
      id: 10,
      contactName: "bernard streith",
      status: "CONTACTED",
      source: "CUSTOM_REQUEST",
      email: null,
      phone: null,
      vehicleBrand: null,
      vehicleModel: null,
      serviceInterest: null,
      nextFollowUpAt: null,
      createdAt: "2026-09-21 11:26:18.725763",
      lastActivityAt: "2026-09-21 11:26:18.725763",
    },
  ]
  // Query builder minimal : la 1re requête (select leads) résout les lignes,
  // la 2e (count) résout le total. On distingue via la présence de `.limit`.
  const makeBuilder = (result: unknown) => {
    const b: Record<string, unknown> = {}
    for (const m of ["select", "from", "where", "orderBy", "limit", "offset"]) {
      b[m] = () => b
    }
    // rendre le builder « thenable » pour être awaité comme une Promise
    ;(b as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result)
    return b
  }
  return {
    db: {
      select: (shape?: Record<string, unknown>) => {
        const isCount = shape != null && "n" in shape
        return makeBuilder(isCount ? [{ n: 1 }] : rows)
      },
    },
  }
})

describe("listLeads — timestamps string PostgreSQL (cas Spirit)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rend la liste sans exception et normalise les dates", async () => {
    const { listLeads } = await import("@/lib/leads/server")
    const res = await listLeads({ companyId: 106, page: 1, pageSize: 25 })

    expect(res.total).toBe(1)
    expect(res.items).toHaveLength(1)

    const item = res.items[0]
    expect(item.id).toBe(10)
    expect(item.contactName).toBe("bernard streith")
    expect(item.status).toBe("CONTACTED")
    expect(item.source).toBe("CUSTOM_REQUEST")

    // lastActivityAt normalisé en Date valide.
    expect(item.lastActivityAt).toBeInstanceOf(Date)
    expect(Number.isNaN(item.lastActivityAt.getTime())).toBe(false)
    expect(item.lastActivityAt.toISOString()).toBe("2026-09-21T11:26:18.725Z")

    // createdAt normalisé en number valide (jamais NaN).
    expect(typeof item.createdAt).toBe("number")
    expect(Number.isNaN(item.createdAt)).toBe(false)
    expect(item.createdAt).toBe(Date.parse("2026-09-21T11:26:18.725Z"))
  })
})
