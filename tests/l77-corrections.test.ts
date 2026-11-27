import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * L77 — corrections des relectures : accueil (Aujourd'hui / Dernières visites,
 * isolées par entreprise), un bloc par réglage, libellé « catégorie · onglet »,
 * onglet piloté par l'adresse, export masqué pour un EMPLOYEE.
 */

type Where =
  | { op: "eq"; col: string; val: unknown }
  | { op: "gt"; col: string; val: unknown }
  | { op: "in"; col: string; vals: unknown[] }
  | { op: "and"; parts: Where[] }

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }))

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>()
  return {
    ...actual,
    eq: (col: { name: string }, val: unknown) => ({ op: "eq", col: col.name, val }),
    gt: (col: { name: string }, val: unknown) => ({ op: "gt", col: col.name, val }),
    inArray: (col: { name: string }, vals: unknown[]) => ({ op: "in", col: col.name, vals }),
    and: (...parts: unknown[]) => ({ op: "and", parts }),
    desc: (col: { name: string }) => ({ desc: col.name }),
  }
})

vi.mock("@/lib/admin/admin-company", () => ({
  requireAdminCompanyId: vi.fn(async () => {
    throw new Error("companyId doit être passé par l'appelant")
  }),
}))

function matches(row: Record<string, unknown>, w: Where): boolean {
  if (w.op === "and") return w.parts.every((p) => matches(row, p))
  if (w.op === "in") return w.vals.includes(row[w.col])
  if (w.op === "gt") return String(row[w.col]) > String(w.val)
  return row[w.col] === w.val
}

vi.mock("@/lib/db", () => ({
  db: {
    select: (cols?: Record<string, { name: string }>) => {
      let where: Where | null = null
      let isBookings = true
      let limit = Infinity
      let order: { desc?: string; name?: string }[] = []
      const q: Record<string, unknown> = {}
      q.from = (table: Record<string, unknown>) => {
        // Lignes de réservation (prestations / véhicules) : aucune dans ce test.
        isBookings = "reference" in table
        return q
      }
      q.where = (w: Where) => {
        where = w
        return q
      }
      q.orderBy = (...o: { desc?: string; name?: string }[]) => {
        order = o
        return q
      }
      q.limit = (n: number) => {
        limit = n
        return q
      }
      q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        if (!isBookings) return Promise.resolve([]).then(res, rej)
        let out = state.rows.filter((r) => (where ? matches(r, where) : true))
        const first = order[0]
        if (first?.desc) {
          const key = first.desc
          out = [...out].sort((a, b) => String(b[key]).localeCompare(String(a[key])))
        }
        out = out.slice(0, limit)
        const mapped = out.map((r) =>
          cols ? Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, r[c.name]])) : r,
        )
        return Promise.resolve(mapped).then(res, rej)
      }
      return q
    },
  },
}))

import { bookings } from "@/lib/db/schema"
import {
  getLaterBookings,
  getRecentVisits,
  getTodayBookings,
  noLaterBookingsText,
  todayInTimezone,
  todayTotalCents,
  visitDateLabel,
} from "@/lib/admin/queries"
import { buildPlusGroups, canExportData } from "@/lib/admin/nav"
import { SETTINGS_SEARCH, searchSettings, settingsResultContext } from "@/lib/admin/settings-search"
import { settingsTabUrl } from "@/components/admin/settings/settings-tabs"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const TENANT_A = 101
const TENANT_B = 202
const TODAY = todayInTimezone("Europe/Paris")

function booking(id: number, companyId: number, date: string, status: string, totalCents: number, startTime = "09:00") {
  return {
    [bookings.id.name]: id,
    [bookings.reference.name]: `R${id}`,
    [bookings.customerName.name]: `Client ${id}`,
    [bookings.date.name]: date,
    [bookings.startTime.name]: startTime,
    [bookings.status.name]: status,
    [bookings.totalCents.name]: totalCents,
    [bookings.address.name]: "1 rue X",
    [bookings.customerPhone.name]: null,
    [bookings.companyId.name]: companyId,
  }
}

describe("L77 — accueil : rendez-vous du jour et dernières visites", () => {
  beforeEach(() => {
    state.rows = [
      booking(1, TENANT_A, TODAY, "confirmed", 8000, "10:00"),
      booking(2, TENANT_A, TODAY, "pending_deposit", 5000, "08:00"),
      booking(3, TENANT_A, TODAY, "cancelled", 9900),
      booking(4, TENANT_A, "2020-01-01", "completed", 12000),
      booking(5, TENANT_A, "2020-02-01", "completed", 7000),
      booking(6, TENANT_B, TODAY, "confirmed", 99999),
      booking(7, TENANT_B, "2020-03-01", "completed", 55555),
    ]
  })

  it("le tenant A ne voit que ses rendez-vous du jour, annulés exclus", async () => {
    const list = await getTodayBookings(TENANT_A, "Europe/Paris")
    expect(list.map((b) => b.id).sort()).toEqual([1, 2])
    expect(todayTotalCents(list)).toBe(13000)
  })

  it("le tenant B ne voit rien du tenant A", async () => {
    expect((await getTodayBookings(TENANT_B, "Europe/Paris")).map((b) => b.id)).toEqual([6])
    expect((await getRecentVisits(TENANT_B)).map((b) => b.id)).toEqual([7])
  })

  it("dernières visites : terminés seulement, du plus récent au plus ancien", async () => {
    expect((await getRecentVisits(TENANT_A)).map((b) => b.id)).toEqual([5, 4])
  })

  it("prochains rendez-vous : jours suivants seulement, isolés par entreprise, même si le jour est chargé", async () => {
    const many = Array.from({ length: 20 }, (_, i) => booking(100 + i, TENANT_A, TODAY, "confirmed", 1000))
    state.rows = [
      ...many,
      booking(200, TENANT_A, "2999-01-02", "confirmed", 1000),
      booking(201, TENANT_A, "2999-01-01", "pending_deposit", 1000),
      booking(202, TENANT_A, "2999-01-03", "cancelled", 1000),
      booking(203, TENANT_A, "2999-01-04", "completed", 1000),
      booking(300, TENANT_B, "2999-01-01", "confirmed", 1000),
    ]
    expect((await getLaterBookings(TENANT_A, "Europe/Paris")).map((b) => b.id).sort()).toEqual([200, 201])
    expect((await getLaterBookings(TENANT_B, "Europe/Paris")).map((b) => b.id)).toEqual([300])
    // L96 : l'accueil standard lit le prochain rendez-vous des jours suivants dans sa requête groupée.
    expect(read("lib/admin/today-query.ts")).toContain('where "companyId" = ${cid} and date > ${today}::date')
  })

  it("aucun rendez-vous : liste vide et total à 0", async () => {
    state.rows = []
    expect(await getTodayBookings(TENANT_A, "Europe/Paris")).toEqual([])
    expect(todayTotalCents([])).toBe(0)
  })

  it("total du jour : plusieurs rendez-vous, l'annulé ne compte jamais", () => {
    expect(
      todayTotalCents([
        { status: "confirmed", totalCents: 1000 },
        { status: "completed", totalCents: 2500 },
        { status: "pending_deposit", totalCents: 500 },
        { status: "cancelled", totalCents: 99999 },
      ]),
    ).toBe(4000)
  })

  it("« aujourd'hui » suit le fuseau de l'entreprise", () => {
    const lateUtc = new Date("2026-03-10T23:30:00Z")
    expect(todayInTimezone("Europe/Paris", lateUtc)).toBe("2026-03-11")
    expect(todayInTimezone("America/Martinique", lateUtc)).toBe("2026-03-10")
    expect(todayInTimezone(null, lateUtc)).toBe("2026-03-11")
  })

  it("un fuseau stocké invalide ne fait pas planter l'accueil (repli Europe/Paris)", () => {
    const lateUtc = new Date("2026-03-10T23:30:00Z")
    expect(todayInTimezone("Pas/UnFuseau", lateUtc)).toBe("2026-03-11")
  })

  it("le bouton (+) reprend le libellé de la maquette validée", () => {
    const bar = read("components/admin/mobile-tab-bar.tsx")
    expect(bar).toContain("Factures / encaisser")
    expect(bar).not.toContain("Factures et devis")
  })

  it("l'accueil standard utilise companyId issu de requireCompanyMember()", () => {
    const page = read("app/admin/(dashboard)/page.tsx")
    expect(page).toContain("const { tenant: company, user, isSuperAdmin } = await requireCompanyMember()")
    expect(page).toContain("const companyId = company.id")
    expect(page).toContain("loadTodayData(companyId, { timezone: company.timezone")
  })
})

describe("L77 — un bloc par réglage", () => {
  it.each([
    ["acompte", "reglage-acompte"],
    ["vacances", "reglage-vacances"],
    ["creneaux", "reglage-creneaux"],
    ["logo site", "reglage-logo-site"],
    ["logo facture", "reglage-logo-factures"],
    ["reseaux", "reglage-reseaux"],
    ["cgv", "reglage-cgv"],
    ["TVA", "reglage-tva"],
    ["frais", "reglage-frais-deplacement"],
  ])("« %s » vise le bloc %s", (q, bloc) => {
    expect(searchSettings(q).map((r) => r.href)).toContainEqual(expect.stringContaining(`&bloc=${bloc}`))
  })

  it("chaque bloc de l'index existe dans les composants de réglages", () => {
    const sources = [
      "components/admin/settings/planning-settings.tsx",
      "components/admin/settings/site-branding.tsx",
      "components/admin/settings/invoicing-settings.tsx",
      "components/admin/settings/location-settings.tsx",
    ]
      .map(read)
      .join("\n")
    for (const e of SETTINGS_SEARCH.filter((x) => x.bloc)) expect(sources, e.bloc).toContain(`id="${e.bloc}"`)
  })

  it("bloc absent (ex. atelier seul) : repli en haut de l'onglet, avec marge sous l'en-tête collant", () => {
    const src = read("components/admin/settings/settings-highlight.tsx")
    expect(src).toContain("document.getElementById(`reglage-${tab}`)")
    expect(src).toContain("scrollMarginTop")
  })
})

describe("L77 — libellé des résultats et écrans", () => {
  it("« acompte » ne propose que le bloc Acompte (le nom de l'onglet ne compte pas)", () => {
    expect(searchSettings("acompte").map((r) => r.label)).toEqual(["Acompte"])
  })

  it("les titres correspondants sortent en premier", () => {
    expect(searchSettings("vacances")[0].label).toBe("Mode vacances")
  })

  it("« Dernières visites » : format de la maquette (véhicule · client, date relative, chevron)", () => {
    expect(visitDateLabel("2026-11-27", "2026-11-27")).toBe("aujourd'hui")
    expect(visitDateLabel("2026-11-26", "2026-11-27")).toBe("hier")
    expect(visitDateLabel("2026-11-23", "2026-11-27")).toBe("lun. 23 nov.")
    expect(visitDateLabel("2025-12-31", "2026-01-01")).toBe("hier")
    expect(visitDateLabel("2025-11-24", "2026-11-27")).toBe("lun. 24 nov. 2025")
  })

  it("« catégorie · onglet »", () => {
    const [acompte] = searchSettings("acompte")
    expect(settingsResultContext(acompte)).toBe("Réservations · Planning & acompte")
    expect(read("components/admin/settings/settings-search.tsx")).toContain("settingsResultContext(r)")
  })

  it("« prix » et « prestation » mènent à Mes prestations, sauf pour Spirit ACS", () => {
    for (const q of ["prix", "prestation"]) {
      expect(searchSettings(q).map((r) => r.href)).toContain("/admin/prestations")
      expect(searchSettings(q, "spirit-acs").map((r) => r.href)).not.toContain("/admin/prestations")
    }
  })
})

describe("L77 — textes et ordre (3e relecture)", () => {
  it("rendez-vous du jour ou visites passées : pas de « premiers rendez-vous »", () => {
    for (const [today, visits] of [[2, 0], [0, 3], [1, 1]]) {
      expect(noLaterBookingsText(today, visits)).toEqual({ title: "Aucun rendez-vous les jours suivants." })
    }
    expect(noLaterBookingsText(0, 0)).toEqual({
      title: "Aucun rendez-vous à venir.",
      hint: "Partagez votre lien de réservation pour recevoir vos premiers rendez-vous.",
    })
  })

  it("« Plus » : seul « Mes prestations » a un sous-titre, comme sur la maquette", () => {
    const withHint = buildPlusGroups({ intent: null, customSiteKey: null })
      .flatMap((g) => g.items)
      .filter((i) => i.hint)
      .map((i) => i.label)
    expect(withHint).toEqual(["Mes prestations"])
  })

  it("« prix » propose d'abord Mes prestations", () => {
    expect(searchSettings("prix")[0].href).toBe("/admin/prestations")
  })

  it("« acomptes » au pluriel trouve le bloc Acompte", () => {
    expect(searchSettings("acomptes").map((r) => r.label)).toEqual(["Acompte"])
  })
})

describe("L77 — onglet piloté par l'adresse", () => {
  it("changer de pastille met à jour tab, retire bloc et garde tenant", () => {
    expect(settingsTabUrl("tab=planning&bloc=reglage-acompte&tenant=demo", "hours")).toBe("?tab=hours&tenant=demo")
  })

  it("la page utilise SettingsTabs (plus de Tabs non contrôlé à clé)", () => {
    const page = read("app/admin/(dashboard)/parametres/page.tsx")
    expect(page).toContain("<SettingsTabs")
    expect(page).not.toContain("defaultValue={activeTab}")
    const hl = read("components/admin/settings/settings-highlight.tsx")
    expect(hl).toContain('p.delete("bloc")')
  })
})

describe("L77 — export selon le rôle", () => {
  const opts = { intent: null, customSiteKey: null }
  const hasExport = (canExport: boolean) =>
    buildPlusGroups({ ...opts, canExport }).some((g) => g.items.some((i) => i.href === "/admin/export"))

  it("EMPLOYEE : pas d'export ; OWNER / ADMIN / super-admin : export", () => {
    expect(canExportData({ role: "EMPLOYEE" })).toBe(false)
    expect(canExportData({ role: "OWNER" })).toBe(true)
    expect(canExportData({ role: "ADMIN" })).toBe(true)
    expect(canExportData({ role: "EMPLOYEE", isSuperAdmin: true })).toBe(true)
    expect(hasExport(false)).toBe(false)
    expect(hasExport(true)).toBe(true)
  })

  it("menu et page « Plus » passent le rôle lu côté serveur", () => {
    expect(read("app/admin/(dashboard)/layout.tsx")).toContain("canExport: canExportData(ctx)")
    expect(read("app/admin/(dashboard)/plus/page.tsx")).toContain("canExport: canExportData({ role, isSuperAdmin })")
  })
})
