import { describe, it, expect, vi } from "vitest"

/**
 * L86 — `/carte` et la vCard : un slug de requête inconnu donne 404, même si le visiteur
 * est connecté et membre d'un autre tenant (aucun repli sur son entreprise).
 * Le vrai `lib/tenant` est utilisé ; en-têtes, session et base sont simulés.
 */

const h = vi.hoisted(() => ({ membershipReads: 0 }))

const OTHER = { id: 2, slug: "bravo", name: "Bravo Clean", status: "ACTIVE", siteContent: null }

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-tenant-slug": "inconnu" }) }))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "membre-de-bravo" } }) } } }))
vi.mock("@/lib/db", () => {
  // Recherche par slug : aucune entreprise. Jointure d'appartenance : le tenant B.
  const bySlug = { where: () => ({ limit: async () => [] }) }
  const byMembership = () => {
    h.membershipReads++
    return { where: () => ({ orderBy: () => ({ limit: async () => [{ company: OTHER }] }) }) }
  }
  return { db: { select: () => ({ from: () => ({ ...bySlug, innerJoin: byMembership }) }) } }
})

import { GET } from "@/app/carte/contact/route"
import CartePage from "@/app/carte/page"

describe("slug inconnu + membre connecté d'un autre tenant", () => {
  it("vCard → 404, rien du tenant du membre", async () => {
    const res = await GET()
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain("Bravo")
    expect(h.membershipReads).toBe(0)
  })

  it("page /carte → notFound()", async () => {
    await expect(CartePage()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(h.membershipReads).toBe(0)
  })
})
