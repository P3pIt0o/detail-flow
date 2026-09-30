import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isOnlineBookingOpen } from "@/lib/booking/online-booking-access"
import { publicReservationPath } from "@/lib/tenant-shared"
import { usesLegacyBookingWizard } from "@/lib/company/publication-shared"

type Company = { id: number; slug: string; status: string; bookingMode: string; customSiteKey: string | null }

const companiesTable: Company[] = [
  { id: 104, slug: "cleanyzer", status: "ACTIVE", bookingMode: "ONLINE", customSiteKey: "cleanyzer" },
  { id: 200, slug: "garage-b", status: "ACTIVE", bookingMode: "ONLINE", customSiteKey: null },
]
let requestHeaders = new Headers()
let sessionUserId: string | null = null
const membershipCompany = companiesTable[1]

vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }))
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => (sessionUserId ? { user: { id: sessionUserId } } : null) } },
}))
vi.mock("drizzle-orm", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, eq: (_c: unknown, value: unknown) => ({ value }), and: (...a: unknown[]) => a[0] }
})
vi.mock("@/lib/db/schema", () => ({
  companies: { __t: "companies", slug: {} },
  companyMembers: { __t: "members", userId: {}, companyId: {} },
  user: { __t: "user" },
}))
vi.mock("@/lib/db", () => {
  const membershipChain = {
    innerJoin: () => membershipChain,
    where: () => membershipChain,
    orderBy: () => membershipChain,
    limit: async () => (sessionUserId ? [{ company: membershipCompany }] : []),
  }
  return {
    db: {
      select: () => ({
        from: (table: { __t: string }) =>
          table.__t === "companies"
            ? { where: (cond: { value: unknown }) => ({ limit: async () => companiesTable.filter((c) => c.slug === cond.value) }) }
            : membershipChain,
      }),
    },
  }
})

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const page = src("app/(site)/reservation/page.tsx")
const action = src("app/(site)/reservation/actions.ts")

function setSlugHeader(slug: string) {
  requestHeaders = new Headers({ "x-tenant-kind": "path", "x-tenant-slug": slug })
}

beforeEach(() => {
  requestHeaders = new Headers()
  sessionUserId = null
})

describe("A/B/D — règle d'ouverture de la réservation", () => {
  const active = { status: "ACTIVE", bookingMode: "ONLINE" }
  it("A/D — tenant actif + licence → ouvert (aucune connexion requise)", () => {
    expect(isOnlineBookingOpen(active, true)).toBe(true)
  })
  it("B — bookingMode DISABLED → fermé", () => {
    expect(isOnlineBookingOpen({ ...active, bookingMode: "DISABLED" }, true)).toBe(false)
  })
  it("B — suspendu / archivé → fermé", () => {
    expect(isOnlineBookingOpen({ ...active, status: "SUSPENDED" }, true)).toBe(false)
    expect(isOnlineBookingOpen({ ...active, status: "ARCHIVED" }, true)).toBe(false)
  })
  it("B — licence sans online_booking → fermé", () => {
    expect(isOnlineBookingOpen(active, false)).toBe(false)
  })
  it("aucun tenant → fermé", () => {
    expect(isOnlineBookingOpen(null, true)).toBe(false)
  })
})

describe("page publique — garde serveur avant BookingV2", () => {
  it("B — tenant fermé → BookingUnavailable, retourné AVANT le rendu de BookingV2", () => {
    const guard = page.indexOf("return <BookingUnavailable")
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(page.indexOf("<BookingV2"))
    expect(guard).toBeLessThan(page.indexOf("getServices()"))
    expect(page).toContain('canUseFeature(requestTenant.id, "online_booking")')
  })
  it("F — slug posé mais tenant introuvable → notFound()", () => {
    expect(page).toContain('if (!requestTenant && (await headers()).get("x-tenant-slug")?.trim()) notFound()')
  })
  it("E — tenant résolu côté serveur uniquement (pas de tenantId/query/cookie lus)", () => {
    expect(page).toContain("resolvePublicRequestTenant()")
    expect(page).not.toMatch(/searchParams[^\n]*tenant|cookies\(\)|tenantId/)
  })
  it("J — Spirit ACS / Rozan exclus de la garde (tunnel historique inchangé)", () => {
    expect(page).toContain("!usesLegacyBookingWizard(requestTenant.customSiteKey)")
    expect(usesLegacyBookingWizard("spirit-acs")).toBe(true)
    expect(usesLegacyBookingWizard("rozan")).toBe(true)
    expect(usesLegacyBookingWizard("cleanyzer")).toBe(false)
  })
})

describe("C — action finale createBookingAction", () => {
  it("refuse côté serveur si tenantAcceptsBookings / online_booking / congés échouent", () => {
    const body = action.slice(action.indexOf("export async function createBookingAction"))
    expect(body).toContain("const tenant = await resolvePublicRequestTenant()")
    expect(body).toContain("if (!tenant) notFound()")
    expect(body).toMatch(/if \(!tenantAcceptsBookings\(tenant\)\) \{\s*return \{\s*ok: false/)
    expect(body).toMatch(/if \(!\(await canUseFeature\(tenant\.id, "online_booking"\)\)\) \{\s*return \{\s*ok: false/)
    expect(body).toMatch(/if \(settings\.vacationMode\) \{\s*return \{\s*ok: false/)
    // Les refus précèdent toute écriture.
    expect(body.indexOf("tenantAcceptsBookings(tenant)")).toBeLessThan(body.indexOf("insert("))
  })
})

describe("E/F/G — résolution stricte du tenant public", () => {
  it("G — chaque slug résout SON tenant", async () => {
    const { resolvePublicRequestTenant } = await import("@/lib/tenant")
    setSlugHeader("cleanyzer")
    expect((await resolvePublicRequestTenant())?.id).toBe(104)
    setSlugHeader("garage-b")
    expect((await resolvePublicRequestTenant())?.id).toBe(200)
  })
  it("F/E — slug inconnu + utilisateur connecté → null (jamais repli sur son entreprise)", async () => {
    const { resolvePublicRequestTenant } = await import("@/lib/tenant")
    sessionUserId = "user-garage-b"
    setSlugHeader("inexistant")
    expect(await resolvePublicRequestTenant()).toBeNull()
  })
  it("E — un utilisateur membre d'un autre tenant ne change pas le tenant du slug", async () => {
    const { resolvePublicRequestTenant } = await import("@/lib/tenant")
    sessionUserId = "user-garage-b"
    setSlugHeader("cleanyzer")
    expect((await resolvePublicRequestTenant())?.id).toBe(104)
  })
  it("sans slug (domaine racine) → comportement historique (appartenance)", async () => {
    const { resolvePublicRequestTenant } = await import("@/lib/tenant")
    sessionUserId = "user-garage-b"
    expect((await resolvePublicRequestTenant())?.id).toBe(200)
  })
  it("E — le middleware réécrit toujours x-tenant-slug (en-tête navigateur ignoré)", () => {
    const mw = src("middleware.ts")
    expect(mw).toContain('ph.set("x-tenant-slug", publicPage.slug)')
    expect(mw).toContain('requestHeaders.set("x-tenant-slug", slug)')
  })
})

describe("H/I — lien partageable vs code widget", () => {
  it("H — lien = chemin /p/<slug>/reservation (URL classique)", () => {
    expect(publicReservationPath("cleanyzer")).toBe("/p/cleanyzer/reservation")
    expect(publicReservationPath("cleanyzer")).not.toMatch(/[<>]|data-|script/)
  })
})
