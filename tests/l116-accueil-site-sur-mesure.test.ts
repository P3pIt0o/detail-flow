import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { TodayScreen } from "@/components/admin/today/today-screen"
import { buildSettingsStatus, type SettingsStatusInput } from "@/lib/admin/settings-status"
import { searchSettings } from "@/lib/admin/settings-search"
import { buildTodayModel, type TodayContext, type TodayData } from "@/lib/admin/today"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
vi.mock("@/app/admin/(dashboard)/reservations/actions", () => ({ updateBookingStatus: vi.fn() }))
vi.mock("@/app/admin/(dashboard)/factures/actions", () => ({ createInvoiceFromBooking: vi.fn() }))
vi.mock("server-only", () => ({}))

/** L116 — sur « Aujourd'hui » et dans les paramètres, un site sur mesure n'a plus d'invitation à partager. */

const OTHERS = [null, "spirit-acs", "rozan", "justclean"]

const data = (over: Partial<TodayData> = {}): TodayData => ({
  today: "2026-11-27",
  settings: {
    businessName: "Durant Detailing",
    businessPhone: "0600000000",
    businessAddress: "1 rue A, Toulouse",
    billingConfirmed: true,
    mobileEnabled: true,
    workshopEnabled: false,
    workshopAddress: "",
    workshopPostalCode: "",
    workshopCity: "",
    hasBaseLocation: true,
    vatEnabled: false,
  },
  serviceCount: 2,
  vehicleTypeCount: 3,
  openDayCount: 5,
  publishedPage: true,
  hasBooking: true,
  todayBookings: [],
  nextBooking: null,
  lapsed: null,
  pendingDeposit: 0,
  requests: { newCount: 0, acceptedCount: 0, quoteSentCount: 0, firstActionId: null },
  unpaid: { count: 0, cents: 0, currencies: [], firstId: null },
  subscriptionRequests: 0,
  cancellationRequests: 0,
  leadsDue: 0,
  figures: null,
  ...over,
})

const ctx = (customSiteKey: string | null): TodayContext => ({
  href: (p) => p,
  intent: null,
  customSiteKey,
  distributionMode: "widget",
  siteTextComplete: true,
  paymentsEnabled: false,
  shareUrl: "https://www.detailflow.fr/reserver",
})

const screen = (d: TodayData, customSiteKey: string | null) =>
  renderToStaticMarkup(
    createElement(TodayScreen, {
      model: buildTodayModel(d, ctx(customSiteKey)),
      firstName: "Tom",
      tenant: null,
      statsHref: "/admin/analyse",
    }),
  ).replace(/&#x27;/g, "'")

const SHARE = ["Partagez votre lien", "Partager votre lien", "Copier mon lien", "QR code", "WhatsApp"]

const CASES: [string, TodayData][] = [
  ["journée vide sans rendez-vous à venir", data()],
  ["journée terminée", data({ hasBooking: true, nextBooking: { date: "2026-12-03", startTime: "09:00" }, todayBookings: [
    {
      id: 1, customerName: "Marie", customerPhone: null, address: null, startTime: "08:00", status: "completed",
      totalCents: 9000, depositCents: 0, paidOnlineCents: 0, isDemo: false, locationType: null, items: [],
    },
  ] })],
  ["compte qui démarre", data({ hasBooking: false, serviceCount: 0 })],
  ["démarrage, réglages faits, aucune réservation", data({ hasBooking: false })],
]

describe("L116 — accueil « Aujourd'hui »", () => {
  it.each(CASES)("%s : aucune carte ni étape de partage pour Cleanyzer", (_name, d) => {
    const html = screen(d, "cleanyzer")
    for (const word of SHARE) expect(html).not.toContain(word)
  })

  it.each(CASES)("%s : tenant B (autre detailer) garde le partage", (_name, d) => {
    for (const key of [null, "rozan", "justclean"]) {
      expect(screen(d, key), String(key)).toMatch(/Partage(z|r) votre lien/)
    }
  })

  it("sans rendez-vous ni étape restante : « Rien aujourd'hui », jamais un écran vide", () => {
    const m = buildTodayModel(data({ hasBooking: false }), ctx("cleanyzer"))
    expect(m.setup).toBeNull()
    expect(m.suggestion).toBeNull()
    expect(m.headline?.title).toBe("Rien aujourd'hui")
  })

  it("liste de démarrage : les réglages restent, sans l'étape de partage", () => {
    const m = buildTodayModel(data({ hasBooking: false, serviceCount: 0 }), ctx("cleanyzer"))
    expect(m.setup?.steps.map((s) => s.key)).toEqual(["company", "service", "hours"])
    expect(m.setup?.doneCount).toBe(2)
  })

  it("les autres suggestions restent (relancer un client, bloquer la journée)", () => {
    const lapsed = { name: "Julien", bookingId: 42, lastDate: "2026-09-04" }
    expect(buildTodayModel(data({ lapsed }), ctx("cleanyzer")).suggestion?.kind).toBe("relaunch")
    const next = { date: "2026-12-03", startTime: "09:00" }
    expect(buildTodayModel(data({ nextBooking: next }), ctx("cleanyzer")).suggestion?.kind).toBe("block")
  })
})

const STATUS: SettingsStatusInput = {
  businessName: "Demo",
  businessEmail: "a@b.fr",
  businessPhone: "0600000000",
  locationSummary: "À domicile",
  servicesCount: 1,
  openDaysCount: 5,
  vacationMode: false,
  depositType: "none",
  depositValue: 0,
  paymentsEnabled: false,
  paymentsReady: false,
  paymentMode: "deposit" as SettingsStatusInput["paymentMode"],
  onlinePaymentsAllowed: false,
  billingComplete: true,
  smsAllowed: false,
  smsEnabled: false,
  smsOffsetHours: 24,
  smsBalance: 0,
  customSiteKey: null,
  onboardingIntent: null,
}

describe("L116 — paramètres : bloc « lien et QR code »", () => {
  it("ligne d'état sans « lien et QR code » pour Cleanyzer, inchangée ailleurs", () => {
    expect(buildSettingsStatus({ ...STATUS, customSiteKey: "cleanyzer" }).site?.text).toBe("Contenu et apparence")
    for (const key of [null, "rozan", "justclean"]) {
      expect(buildSettingsStatus({ ...STATUS, customSiteKey: key }).site?.text).toBe("Contenu, apparence, lien et QR code")
    }
  })

  it("recherche : « Lien et QR code » absent pour Cleanyzer seulement", () => {
    const labels = (key: string | null) => searchSettings("qr code", key).map((r) => r.label)
    expect(labels("cleanyzer")).not.toContain("Lien et QR code")
    for (const key of OTHERS.filter((k) => k !== "spirit-acs")) expect(labels(key)).toContain("Lien et QR code")
  })

  it("la page ne rend plus le bloc quand le partage est masqué", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync("app/admin/(dashboard)/parametres/page.tsx", "utf8")
    expect(src).toMatch(/isSpiritSite \|\| adminProfile\.hideShareActions \? null : humanReservationUrl/)
  })
})
