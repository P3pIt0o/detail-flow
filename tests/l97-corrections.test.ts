import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

const h = vi.hoisted(() => ({ tenantId: 1, wheres: [] as unknown[] }))

vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/admin", () => ({ requireCompanyMember: async () => ({ tenant: { id: h.tenantId } }) }))
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (w: unknown) => {
          h.wheres.push(w)
          return { limit: async () => [{ id: 1 }] }
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: async (w: unknown) => {
          h.wheres.push(w)
        },
      }),
    }),
    insert: () => ({ values: async () => {} }),
  },
}))

import { getBusinessLinks } from "@/lib/admin/settings-nav"
import { searchSettings } from "@/lib/admin/settings-search"
import { buildSettingsStatus, type SettingsStatusInput } from "@/lib/admin/settings-status"
import { saveDeposit, savePlanning, saveVacationMode } from "@/app/admin/(dashboard)/parametres/actions"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const BASE: SettingsStatusInput = {
  businessName: "Atelier A",
  businessEmail: "a@example.test",
  businessPhone: "0600000000",
  locationSummary: "",
  servicesCount: 3,
  openDaysCount: 5,
  vacationMode: false,
  depositType: "percent",
  depositValue: 30,
  paymentsEnabled: true,
  paymentsReady: true,
  paymentMode: "deposit",
  onlinePaymentsAllowed: true,
  billingComplete: true,
  smsAllowed: true,
  smsEnabled: false,
  smsOffsetHours: 24,
  smsBalance: 0,
  customSiteKey: null,
  onboardingIntent: null,
}

describe("L97 — la ligne d'état suit le mode de paiement", () => {
  const text = (over: Partial<SettingsStatusInput>) => buildSettingsStatus({ ...BASE, ...over }).billing?.text

  it("paiement intégral", () => {
    expect(text({ paymentMode: "full" })).toBe("Paiement intégral demandé en ligne · facturation prête")
  })
  it("au choix du client", () => {
    expect(text({ paymentMode: "choice" })).toBe("Acompte ou totalité au choix du client · facturation prête")
    expect(text({ paymentMode: "choice", depositType: "none" })).toBe(
      "Paiement intégral demandé en ligne · facturation prête",
    )
  })
  it("acompte, ou paiement en ligne non effectif : la règle d'acompte", () => {
    const deposit = "Acompte de 30 % demandé · facturation prête"
    expect(text({})).toBe(deposit)
    expect(text({ paymentMode: "full", paymentsEnabled: false })).toBe(deposit)
    expect(text({ paymentMode: "full", onlinePaymentsAllowed: false })).toBe(deposit)
    expect(text({ paymentMode: "full", paymentsReady: false })).toContain("Acompte de 30 % demandé")
  })
  it("la page transmet le mode et le droit du tenant connecté", () => {
    const page = read("app/admin/(dashboard)/parametres/page.tsx")
    expect(page).toContain("paymentMode: paymentConfig.paymentMode")
    expect(page).toContain('canUseFeature(tenant.id, "online_payments")')
  })
})

describe("L97 — « Mon entreprise » mène au logo et au SIREN/TVA", () => {
  const hrefs = (key: string | null, intent: string | null = null) => getBusinessLinks(key, intent).map((l) => l.href)

  it("tenant standard", () => {
    expect(hrefs(null)).toEqual([
      "/admin/parametres?tab=invoicing&bloc=reglage-invoicing",
      "/admin/parametres?tab=invoicing&bloc=reglage-logo-factures",
      "/admin/parametres?tab=site&bloc=reglage-logo-site",
    ])
  })
  it("Spirit et booking_only : pas de lien vers un logo de site masqué", () => {
    expect(hrefs("spirit-acs")).toHaveLength(2)
    expect(hrefs(null, "booking_only")).toHaveLength(2)
  })
  it("la page les affiche", () => {
    expect(read("app/admin/(dashboard)/parametres/page.tsx")).toContain("getBusinessLinks(")
  })
})

describe("L97 — la barre fixe ne fait perdre aucune saisie", () => {
  it("créneaux : « Enregistrer » enregistre aussi le mode vacances modifié", () => {
    const src = read("components/admin/settings/planning-settings.tsx")
    const save = src.slice(src.indexOf("function save()"), src.indexOf("const saveBar"))
    expect(save).toContain("vacationChanged")
    expect(save).toContain("saveVacationMode(")
  })
  it("facturation : barre fixée seulement si ce formulaire est modifié", () => {
    expect(read("components/admin/settings/invoicing-settings.tsx")).toMatch(/<StickySaveBar pinned=\{dirty/)
    const bar = read("components/admin/settings/more-options.tsx")
    expect(bar).toContain("pinned = true")
  })
})

describe("L97 — recherche complétée", () => {
  it.each([
    ["QR code", "/admin/parametres?tab=site&bloc=reglage-lien"],
    ["heures de début", "/admin/parametres?tab=hours&bloc=reglage-hours"],
    ["abonnement", "/admin/abonnement"],
  ])("« %s »", (q, href) => {
    expect(searchSettings(q).map((r) => r.href)).toContain(href)
  })
  it("Spirit : pas de lien ni QR code", () => {
    expect(searchSettings("QR code", "spirit-acs")).toEqual([])
  })
})

describe("L97 — textes repris après la revue", () => {
  it("paiements : plus de renvoi à l'onglet disparu « Planning & acompte »", () => {
    const src = read("components/admin/settings/payments-settings.tsx")
    expect(src).not.toMatch(/Planning & acompte|onglet Planning/)
    expect(src.match(/Paiements et factures, onglet Acompte/g)).toHaveLength(3)
  })
  it("notifications hors formule : la formule est nommée, lue dans PLAN_MATRIX", () => {
    const src = read("components/admin/settings/notifications-settings.tsx")
    expect(src).not.toContain("offre supérieure")
    expect(src).toContain("minimalPlanName(feature)")
    expect(src).toContain("Disponible avec ${plan}")
    expect(src).toContain('<LockedBanner feature="email_reminders" />')
    expect(src).toContain('<LockedBanner feature="review_requests" />')
  })
  it("champ de recherche : le texte de la maquette", () => {
    expect(read("components/admin/settings/settings-search.tsx")).toContain(
      'placeholder="Rechercher : acompte, horaires, SMS…"',
    )
  })
})

describe("L97 — les actions des écrans déplacés écrivent chez le seul tenant connecté", () => {
  beforeEach(() => {
    h.wheres.length = 0
  })

  const calls: [string, () => Promise<unknown>][] = [
    ["acompte", () => saveDeposit({ depositType: "percent", depositValue: 30 })],
    ["créneaux", () => savePlanning({ maxVehiclesPerDay: 2, slotIntervalMin: 30, bufferMin: 0, minNoticeHours: 24 })],
    ["vacances", () => saveVacationMode({ vacationMode: true, vacationMessage: "" })],
  ]

  it.each(calls)("%s : tenant B ne vise jamais le tenant A", async (_name, call) => {
    h.tenantId = 2
    await call()
    expect(h.wheres.length).toBeGreaterThan(0)
    for (const w of h.wheres) {
      const q = new PgDialect().sqlToQuery(w as SQL)
      expect(q.sql).toContain('"companyId" =')
      expect(q.params).toEqual([2])
    }
  })
})
