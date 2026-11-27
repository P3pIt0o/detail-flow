import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  ALL_SETTINGS_TABS,
  findCategoryByTab,
  getVisibleSettingsCategories,
  legacySettingsRedirect,
  getSettingsHome,
} from "@/lib/admin/settings-nav"
import { searchSettings } from "@/lib/admin/settings-search"
import { buildSettingsStatus, minimalPlanName, type SettingsStatusInput } from "@/lib/admin/settings-status"
import { COMMERCIAL_PLANS } from "@/lib/pricing/plans"
import { PLAN_MATRIX } from "@/lib/licensing/registry"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const PAGE = "app/admin/(dashboard)/parametres/page.tsx"

/** Ancien onglet → entrée des Paramètres qui le contient désormais. */
const MOVES: [tab: string, categoryId: string, categoryLabel: string][] = [
  ["business", "entreprise", "Mon entreprise"],
  ["travel", "entreprise", "Mon entreprise"],
  ["hours", "reservations", "Mes disponibilités"],
  ["timeoff", "reservations", "Mes disponibilités"],
  ["planning", "reservations", "Mes disponibilités"],
  ["site", "site", "Ma page de réservation"],
  ["appearance", "site", "Ma page de réservation"],
  ["gallery", "site", "Ma page de réservation"],
  ["reviews", "site", "Ma page de réservation"],
  ["custom-requests", "site", "Ma page de réservation"],
  ["deposit", "billing", "Paiements et factures"],
  ["payments", "billing", "Paiements et factures"],
  ["invoicing", "billing", "Paiements et factures"],
  ["promo", "billing", "Paiements et factures"],
  ["sms", "communications", "Messages aux clients"],
  ["notifications", "communications", "Messages aux clients"],
  ["security", "account", "Mon compte"],
  ["data", "account", "Mon compte"],
  ["support", "account", "Mon compte"],
]

describe("L97 — aucun réglage perdu", () => {
  it.each(MOVES)("%s est joignable dans « %s »", (tab, id, label) => {
    expect(findCategoryByTab(tab)).toMatchObject({ id, label })
  })

  it("le tableau couvre exactement tous les onglets", () => {
    expect(MOVES.map((m) => m[0]).sort()).toEqual([...ALL_SETTINGS_TABS].sort())
  })

  it("chaque onglet a son contenu dans la page", () => {
    const page = read(PAGE)
    for (const tab of ALL_SETTINGS_TABS) expect(page, tab).toContain(`id="reglage-${tab}"`)
  })

  it("le document de correspondance cite chaque onglet et son entrée", () => {
    expect(existsSync(join(process.cwd(), "docs/audits/L97-correspondance.md"))).toBe(true)
    const doc = read("docs/audits/L97-correspondance.md")
    for (const [tab, , label] of MOVES) {
      expect(doc.split("\n").some((l) => l.includes(`?tab=${tab}\``) && l.includes(label)), tab).toBe(true)
    }
  })
})

describe("L97 — redirection de l'acompte", () => {
  it("l'ancien lien du bloc acompte mène au nouvel onglet, en gardant le tenant", () => {
    expect(legacySettingsRedirect({ tab: "planning", bloc: "reglage-acompte" })).toBe(
      "/admin/parametres?tab=deposit&bloc=reglage-acompte",
    )
    expect(legacySettingsRedirect({ tab: "planning", bloc: "reglage-acompte", tenant: "demo" })).toBe(
      "/admin/parametres?tab=deposit&bloc=reglage-acompte&tenant=demo",
    )
  })

  it("les autres anciens liens ne sont pas redirigés", () => {
    expect(legacySettingsRedirect({ tab: "planning" })).toBeNull()
    expect(legacySettingsRedirect({ tab: "planning", bloc: "reglage-creneaux" })).toBeNull()
    expect(legacySettingsRedirect({ tab: "deposit", bloc: "reglage-acompte" })).toBeNull()
    expect(legacySettingsRedirect({})).toBeNull()
  })

  it("la page applique la redirection", () => {
    expect(read(PAGE)).toContain("legacySettingsRedirect(")
  })

  it("la page ouvre l'acompte et les créneaux avec leur seul bloc", () => {
    const page = read(PAGE)
    expect(page).toContain('section="deposit"')
    expect(page).toContain('section="planning"')
    const planning = read("components/admin/settings/planning-settings.tsx")
    expect(planning).toMatch(/section === "deposit"/)
    expect(planning).toContain("saveDeposit(")
    expect(planning).toContain("savePlanning(")
  })

  it("« Ma réservation » renvoie le paiement vers le nouvel onglet", () => {
    expect(read("lib/booking/setup-status.ts")).toContain("/admin/parametres?tab=deposit")
  })
})

describe("L97 — accueil : 6 entrées + Mon compte", () => {
  const labels = (o: ReturnType<typeof getSettingsHome>) => o.main.map((e) => e.label)

  it("tenant standard", () => {
    const home = getSettingsHome(null, null)
    expect(labels(home)).toEqual([
      "Mon entreprise",
      "Mes prestations et prix",
      "Mes disponibilités",
      "Ma page de réservation",
      "Paiements et factures",
      "Messages aux clients",
    ])
    expect(home.account.map((e) => e.label)).toEqual(["Sécurité", "Mes données", "Abonnement", "Assistance"])
    expect(home.main.find((e) => e.id === "services")?.href).toBe("/admin/prestations")
    expect(home.account.find((e) => e.id === "subscription")?.href).toBe("/admin/abonnement")
    expect(home.main.find((e) => e.id === "billing")?.href).toBe("/admin/parametres?tab=deposit")
  })

  it("Spirit ACS : ni prestations, ni disponibilités ; mêmes réglages masqués", () => {
    const home = getSettingsHome("spirit-acs", null)
    expect(labels(home)).toEqual(["Mon entreprise", "Ma page de réservation", "Paiements et factures", "Messages aux clients"])
    for (const tab of ["hours", "timeoff", "planning", "travel", "deposit", "payments", "promo", "appearance", "custom-requests"]) {
      expect(findCategoryByTab(tab, "spirit-acs"), tab).toBeNull()
    }
    expect(home.main.find((e) => e.id === "billing")?.href).toBe("/admin/parametres?tab=invoicing")
  })

  it("booking_only : page de réservation réduite aux demandes spéciales", () => {
    const home = getSettingsHome(null, "booking_only")
    expect(labels(home)).toHaveLength(6)
    expect(home.main.find((e) => e.id === "site")?.href).toBe("/admin/parametres?tab=custom-requests")
    expect(getVisibleSettingsCategories(null, "booking_only").find((c) => c.id === "site")?.subTabs).toHaveLength(1)
  })
})

describe("L97 — recherche", () => {
  it.each([
    ["acompte", "/admin/parametres?tab=deposit&bloc=reglage-acompte", "Paiements et factures"],
    ["horaires", "/admin/parametres?tab=hours&bloc=reglage-hours", "Mes disponibilités"],
    ["SMS", "/admin/parametres?tab=sms&bloc=reglage-sms", "Messages aux clients"],
  ])("« %s » mène au réglage exact", (q, href, category) => {
    expect(searchSettings(q)[0]).toMatchObject({ href, category })
  })

  it("Spirit : l'acompte ne sort jamais", () => {
    expect(searchSettings("acompte", "spirit-acs")).toEqual([])
  })
})

const OK: SettingsStatusInput = {
  businessName: "Atelier A",
  businessEmail: "a@example.test",
  businessPhone: "0600000000",
  locationSummary: "Déplacement chez le client",
  servicesCount: 3,
  openDaysCount: 5,
  vacationMode: false,
  depositType: "percent",
  depositValue: 30,
  paymentsEnabled: false,
  paymentsReady: false,
  billingComplete: true,
  smsAllowed: true,
  smsEnabled: true,
  smsOffsetHours: 24,
  smsBalance: 12,
  customSiteKey: null,
  onboardingIntent: null,
}

describe("L97 — lignes d'état et points orange", () => {
  it("tout est réglé : phrases claires, aucun point", () => {
    const s = buildSettingsStatus(OK)
    expect(s.entreprise).toEqual({ text: "Nom et coordonnées renseignés · Déplacement chez le client", attention: false })
    expect(s.services).toEqual({ text: "3 prestations · gabarits de véhicules", attention: false })
    expect(s.reservations).toEqual({ text: "Ouvert 5 jours par semaine", attention: false })
    expect(s.site).toEqual({ text: "Contenu, apparence, lien et QR code", attention: false })
    expect(s.billing).toEqual({ text: "Acompte de 30 % demandé · facturation prête", attention: false })
    expect(s.communications).toEqual({ text: "Rappel SMS 24 h avant", attention: false })
  })

  it.each(["businessName", "businessEmail", "businessPhone"] as const)("%s manquant : point orange", (key) => {
    expect(buildSettingsStatus({ ...OK, [key]: "  " }).entreprise).toMatchObject({ attention: true })
  })

  it("aucune prestation, aucun horaire", () => {
    const s = buildSettingsStatus({ ...OK, servicesCount: 0, openDaysCount: 0 })
    expect(s.services).toEqual({ text: "Aucune prestation à réserver", attention: true })
    expect(s.reservations).toEqual({ text: "Aucun jour d'ouverture", attention: true })
  })

  it("singulier et mode vacances", () => {
    const s = buildSettingsStatus({ ...OK, servicesCount: 1, openDaysCount: 1, vacationMode: true })
    expect(s.services?.text).toBe("1 prestation · gabarits de véhicules")
    expect(s.reservations?.text).toBe("Ouvert 1 jour par semaine · mode vacances activé")
  })

  it("acompte fixe en centimes, ou aucun", () => {
    expect(buildSettingsStatus({ ...OK, depositType: "fixed", depositValue: 2050 }).billing?.text).toContain(
      "Acompte de 20,50 € demandé",
    )
    expect(buildSettingsStatus({ ...OK, depositType: "none" }).billing?.text).toContain("Aucun acompte demandé")
    expect(buildSettingsStatus({ ...OK, depositValue: 0 }).billing?.text).toContain("Aucun acompte demandé")
  })

  it("facturation incomplète : point orange", () => {
    expect(buildSettingsStatus({ ...OK, billingComplete: false }).billing).toEqual({
      text: "Acompte de 30 % demandé · facturation à compléter",
      attention: true,
    })
  })

  it("paiements activés sans compte prêt : point orange ; désactivés : aucun", () => {
    expect(buildSettingsStatus({ ...OK, paymentsEnabled: true }).billing).toMatchObject({ attention: true })
    expect(buildSettingsStatus({ ...OK, paymentsEnabled: true }).billing?.text).toContain("compte de paiement à terminer")
    expect(buildSettingsStatus({ ...OK, paymentsEnabled: true, paymentsReady: true }).billing).toMatchObject({
      attention: false,
    })
  })

  it("rappel SMS activé sans crédit : point orange ; désactivé : aucun", () => {
    expect(buildSettingsStatus({ ...OK, smsBalance: 0 }).communications).toEqual({
      text: "Rappel SMS activé, aucun crédit",
      attention: true,
    })
    expect(buildSettingsStatus({ ...OK, smsEnabled: false, smsBalance: 0 }).communications).toEqual({
      text: "Rappel SMS désactivé",
      attention: false,
    })
  })

  it("SMS hors formule : « Disponible avec … », sans point", () => {
    expect(buildSettingsStatus({ ...OK, smsAllowed: false, smsBalance: 0 }).communications).toEqual({
      text: `Rappels SMS : disponible avec ${minimalPlanName("sms")}`,
      attention: false,
    })
  })

  it("Spirit : aucune ligne ni point pour un réglage masqué", () => {
    const s = buildSettingsStatus({
      ...OK,
      customSiteKey: "spirit-acs",
      servicesCount: 0,
      openDaysCount: 0,
      paymentsEnabled: true,
    })
    expect(s.services).toBeUndefined()
    expect(s.reservations).toBeUndefined()
    expect(s.billing).toEqual({ text: "Facturation prête", attention: false })
    expect(s.entreprise?.text).toBe("Nom et coordonnées renseignés")
    expect(s.site?.text).toBe("Textes du site, galerie et avis")
  })

  it("booking_only : la page de réservation annonce les demandes spéciales", () => {
    expect(buildSettingsStatus({ ...OK, onboardingIntent: "booking_only" }).site?.text).toBe("Demandes spéciales et lien")
  })
})

describe("L97 — formule minimale lue dans PLAN_MATRIX", () => {
  it.each(["sms", "email_reminders", "review_requests", "online_payments"] as const)("%s", (feature) => {
    const expected = COMMERCIAL_PLANS.find((p) => p.licensePlan && PLAN_MATRIX[p.licensePlan].features[feature])?.name
    expect(expected).toBeTruthy()
    expect(minimalPlanName(feature)).toBe(expected)
  })

  it("aucun nom de formule écrit en dur", () => {
    for (const f of ["lib/admin/settings-status.ts", "components/admin/settings/sms-settings.tsx"]) {
      expect(read(f)).not.toMatch(/Essentiel|Indépendant|Performance|Équipe/)
    }
  })
})

describe("L97 — état calculé pour le tenant connecté seulement", () => {
  it("les lectures de la page reçoivent tenant.id issu de requireCompanyMember()", () => {
    const page = read(PAGE)
    expect(page).toContain("await requireCompanyMember()")
    for (const call of [
      "getSettings(tenant.id)",
      "getBusinessHours(tenant.id)",
      "getTimeOff(tenant.id)",
      "getFullSettings(tenant.id)",
      "getServices(tenant.id)",
      "getSmsBalance(tenant.id)",
      "getTenantPaymentConfig(tenant.id)",
      "getLocationConfig(tenant.id)",
    ]) {
      expect(page, call).toContain(call)
    }
    expect(page).not.toMatch(/get(Settings|BusinessHours|TimeOff|FullSettings|Services)\(\)/)
  })

  it("la fonction d'état est pure : aucune lecture, donc aucune donnée d'un autre tenant", () => {
    expect(read("lib/admin/settings-status.ts")).not.toMatch(/fetch\(|@\/lib\/db|server-only|requireCompany/)
    const a = buildSettingsStatus(OK)
    buildSettingsStatus({ ...OK, servicesCount: 0, businessName: "" }) // tenant B
    expect(buildSettingsStatus(OK)).toEqual(a)
  })
})

describe("L97 — « Plus d'options » et bouton fixe sur mobile", () => {
  const files = ["planning-settings", "invoicing-settings", "sms-settings"].map((n) => `components/admin/settings/${n}.tsx`)

  it.each(files)("%s", (file) => {
    const src = read(file)
    expect(src).toContain("<MoreOptions")
    expect(src).toContain("<StickySaveBar")
  })

  it("le contenu replié reste monté (aucune saisie perdue) et la barre n'est fixe que sur mobile", () => {
    const src = read("components/admin/settings/more-options.tsx")
    expect(src).toContain("<details")
    expect(src).toContain("Plus d&apos;options")
    expect(src).toMatch(/\bfixed\b/)
    expect(src).toMatch(/sm:static/)
  })
})
