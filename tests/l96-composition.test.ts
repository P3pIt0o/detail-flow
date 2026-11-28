import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  buildTodayModel,
  finishAndInvoice,
  shouldShareReservation,
  type TodayBooking,
  type TodayContext,
  type TodayData,
} from "@/lib/admin/today"

/** L96 — composition de l'écran « Aujourd'hui » selon la situation réelle (logique pure). */

const TODAY = "2026-11-27" // vendredi

const booking = (over: Partial<TodayBooking> = {}): TodayBooking => ({
  id: 1,
  customerName: "Marie Dupont",
  customerPhone: "06 12 34 56 78",
  address: "12 rue des Lilas, 31000 Toulouse",
  startTime: "09:00",
  status: "confirmed",
  totalCents: 9000,
  depositCents: 0,
  paidOnlineCents: 0,
  isDemo: false,
  locationType: null,
  items: [{ service: "Nettoyage intérieur complet", brand: "Peugeot", model: "308", type: "Citadine" }],
  ...over,
})

const data = (over: Partial<TodayData> = {}): TodayData => ({
  today: TODAY,
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

const ctx = (over: Partial<TodayContext> = {}): TodayContext => ({
  href: (p) => p,
  intent: null,
  customSiteKey: null,
  distributionMode: null,
  siteTextComplete: true,
  paymentsEnabled: false,
  shareUrl: "https://www.detailflow.fr/?tenant=durant",
  ...over,
})

describe("compte qui démarre", () => {
  const fresh = data({
    settings: { ...data().settings, businessName: "Durant", businessPhone: "", businessAddress: "", billingConfirmed: false },
    serviceCount: 0,
    openDayCount: 0,
    publishedPage: false,
    hasBooking: false,
  })

  it("liste d'étapes, chacune vers le bon réglage ; ni journée vide, ni chiffres, ni facturation à traiter", () => {
    const m = buildTodayModel(fresh, ctx({ intent: "public_page", siteTextComplete: false }))
    expect(m.setup?.steps.map((s) => s.key)).toEqual(["company", "service", "hours", "page", "share"])
    expect(m.setup?.steps.map((s) => s.href)).toEqual([
      "/admin/parametres?tab=business",
      "/admin/prestations",
      "/admin/parametres?tab=hours",
      "/admin/page-publique",
      null,
    ])
    expect(m.setup?.doneCount).toBe(0)
    expect(m.day).toBeNull()
    expect(m.suggestion).toBeNull()
    expect(m.figures).toBeNull()
    expect(m.todo).toEqual([])
  })

  it("lieu mal configuré : « entreprise » non faite, lien vers le réglage du lieu", () => {
    const company = (over: Partial<TodayData["settings"]>) =>
      buildTodayModel(data({ hasBooking: false, settings: { ...data().settings, ...over } }), ctx()).setup?.steps[0]
    expect(company({ hasBaseLocation: false })).toMatchObject({ done: false, href: "/admin/parametres?tab=travel" })
    expect(company({ workshopEnabled: true, workshopAddress: "1 rue A" })?.done).toBe(false)
    expect(company({ mobileEnabled: false, workshopEnabled: false })?.done).toBe(false)
    expect(
      company({ mobileEnabled: false, hasBaseLocation: false, workshopEnabled: true, workshopAddress: "1", workshopPostalCode: "31000", workshopCity: "T" })?.done,
    ).toBe(true)
  })

  it("compte établi : jamais la liste de démarrage, ce qui manque passe en « À traiter »", () => {
    const m = buildTodayModel(data({ openDayCount: 0, publishedPage: false }), ctx({ intent: "public_page" }))
    expect(m.setup).toBeNull()
    expect(m.todo.map((t) => [t.label, t.action, t.href])).toEqual([
      ["Définir mes horaires", "Régler", "/admin/parametres?tab=hours"],
      ["Mettre ma page en ligne", "Ouvrir", "/admin/page-publique"],
    ])
  })

  it("partage : la page seulement si elle est en ligne, sinon le lien de réservation", () => {
    const base = { publishedPage: true, intent: null, distributionMode: null, customSiteKey: null }
    expect(shouldShareReservation(base)).toBe(false)
    expect(shouldShareReservation({ ...base, publishedPage: false })).toBe(true)
    expect(shouldShareReservation({ ...base, intent: "booking_only" })).toBe(true)
    expect(shouldShareReservation({ ...base, intent: "custom_website" })).toBe(true)
    expect(shouldShareReservation({ ...base, distributionMode: "widget" })).toBe(true)
    expect(shouldShareReservation({ ...base, customSiteKey: "cleanyzer" })).toBe(true)
  })

  it("prestation sans type de véhicule : étape non faite", () => {
    const m = buildTodayModel(data({ hasBooking: false, vehicleTypeCount: 0 }), ctx())
    expect(m.setup?.steps.find((s) => s.key === "service")?.done).toBe(false)
  })

  it("parcours « réservation seule », widget et site sur mesure : pas d'étape « page en ligne »", () => {
    for (const c of [ctx({ intent: "booking_only" }), ctx({ distributionMode: "widget" }), ctx({ intent: "custom_website" }), ctx({ customSiteKey: "rozan" })]) {
      expect(buildTodayModel(fresh, c).setup?.steps.map((s) => s.key)).toEqual(["company", "service", "hours", "share"])
    }
    // L116 : Cleanyzer n'a pas non plus l'étape de partage.
    expect(buildTodayModel(fresh, ctx({ customSiteKey: "cleanyzer" })).setup?.steps.map((s) => s.key)).toEqual(["company", "service", "hours"])
  })

  it("la liste disparaît quand tout est fait (première vraie réservation reçue)", () => {
    expect(buildTodayModel(data(), ctx()).setup).toBeNull()
    expect(buildTodayModel(data({ hasBooking: false }), ctx()).setup?.steps.find((s) => s.key === "share")?.done).toBe(false)
  })

  it("facturation non confirmée : une ligne « À traiter » seulement dès qu'il y a une réservation", () => {
    const unconfirmed = { ...data().settings, billingConfirmed: false }
    expect(buildTodayModel(data({ settings: unconfirmed }), ctx()).todo.map((t) => t.href)).toEqual(["/admin/parametres?tab=invoicing"])
    expect(buildTodayModel(data({ settings: unconfirmed, hasBooking: false }), ctx()).todo).toEqual([])
  })
})

describe("journée avec rendez-vous", () => {
  const busy = data({
    todayBookings: [
      booking({ id: 1, status: "completed", startTime: "08:00" }),
      booking({ id: 2, startTime: "11:30", customerName: "Paul Martin", locationType: "workshop" }),
      booking({ id: 3, startTime: "15:00", customerName: "Sofia Leroy" }),
    ],
  })

  it("le prochain est le premier non terminé ; la frise garde toute la journée", () => {
    const m = buildTodayModel(busy, ctx())
    expect(m.day?.next?.id).toBe(2)
    expect(m.day?.list.map((a) => a.id)).toEqual([1, 2, 3])
    expect(m.dateLabel).toBe("Vendredi 27 novembre")
    expect(m.suggestion).toBeNull()
    expect(m.headline).toBeNull()
  })

  it("domicile : itinéraire et adresse ; atelier : ni l'un ni l'autre", () => {
    const m = buildTodayModel(busy, ctx())
    expect(m.day?.list[2].mapsUrl).toContain("google.com/maps/dir")
    expect(m.day?.list[1].mapsUrl).toBeNull()
    expect(m.day?.list[1].atWorkshop).toBe(true)
  })

  it("atelier seul (réglage de l'entreprise, rendez-vous sans lieu enregistré) : pas d'itinéraire", () => {
    const m = buildTodayModel(
      data({ settings: { ...data().settings, mobileEnabled: false }, todayBookings: [booking()] }),
      ctx(),
    )
    expect(m.day?.next?.mapsUrl).toBeNull()
    expect(m.day?.next?.atWorkshop).toBe(true)
  })

  it("« Terminer et encaisser » seulement si confirmé ; montant masqué quand un acompte existe", () => {
    expect(buildTodayModel(data({ todayBookings: [booking()] }), ctx()).day?.next).toMatchObject({ canFinish: true, amountCents: 9000 })
    expect(buildTodayModel(data({ todayBookings: [booking({ status: "pending_deposit" })] }), ctx()).day?.next?.canFinish).toBe(false)
    expect(buildTodayModel(data({ todayBookings: [booking({ depositCents: 3000 })] }), ctx()).day?.next?.amountCents).toBeNull()
  })

  it("déjà payé en ligne : aucun montant à encaisser", () => {
    const next = (over: Partial<TodayBooking>) => buildTodayModel(data({ todayBookings: [booking(over)] }), ctx()).day?.next
    expect(next({ paidOnlineCents: 9000 })).toMatchObject({ amountCents: null, paidOnlineCents: 9000, paidInFull: true })
    expect(next({ paidOnlineCents: 3000 })).toMatchObject({ amountCents: null, paidOnlineCents: 3000, paidInFull: false })
    expect(next({})).toMatchObject({ amountCents: 9000, paidOnlineCents: 0, paidInFull: false })
  })

  describe("avertissements de paiement : la facture déduit l'acompte prévu, pas les autres paiements en ligne", () => {
    const next = (over: Partial<TodayBooking>, vatEnabled = false) =>
      buildTodayModel(data({ todayBookings: [booking(over)], settings: { ...data().settings, vatEnabled } }), ctx()).day!.next!
    const notes = (over: Partial<TodayBooking>) => next(over).paymentNotes.join(" ").replace(/\s/g, " ")

    it("aucun paiement ni acompte : aucun avertissement", () => {
      expect(next({}).paymentNotes).toEqual([])
    })

    it("acompte payé en ligne : déjà déduit, rien à retirer à la main", () => {
      expect(notes({ depositCents: 3000, paidOnlineCents: 3000 })).toBe("L'acompte de 30 € payé en ligne est déjà déduit de la facture.")
    })

    it("tout payé sans acompte : la facture ne déduit rien", () => {
      expect(notes({ paidOnlineCents: 9000 })).toBe("La facture ne déduit pas 90 € déjà payés en ligne : ne les encaissez pas une seconde fois.")
    })

    it("tout payé avec un acompte configuré : seule la part au-delà de l'acompte n'est pas déduite", () => {
      expect(notes({ depositCents: 3000, paidOnlineCents: 9000 })).toBe("La facture ne déduit pas 60 € déjà payés en ligne : ne les encaissez pas une seconde fois.")
    })

    it("acompte prévu mais pas reçu en ligne : à vérifier", () => {
      expect(notes({ depositCents: 3000 })).toBe("La facture déduit un acompte de 30 € non reçu en totalité en ligne : vérifiez que vous l'avez bien encaissé.")
    })

    it("avec TVA : aucun montant sur le bouton, jamais « payé en totalité »", () => {
      expect(next({}, true).amountCents).toBeNull()
      expect(next({ paidOnlineCents: 9000 }, true)).toMatchObject({ amountCents: null, paidInFull: false })
    })
  })

  it("rendez-vous de démonstration : jamais « Terminer et encaisser »", () => {
    expect(buildTodayModel(data({ todayBookings: [booking({ isDemo: true })] }), ctx()).day?.next?.canFinish).toBe(false)
  })

  it("journée terminée avec un rendez-vous à venir et personne à relancer : partager le lien, jamais « Bloquer la journée »", () => {
    const m = buildTodayModel(
      data({ todayBookings: [booking({ status: "completed" })], nextBooking: { date: "2026-12-03", startTime: "09:00" } }),
      ctx(),
    )
    expect(m.headline?.title).toBe("Journée terminée")
    expect(m.suggestion).toEqual({ kind: "share" })
  })

  it("relance : formule de la maquette (« depuis N jours »), sans accord genré", () => {
    const screen = readFileSync("components/admin/today/today-screen.tsx", "utf8")
    expect(screen).toContain("Aucune visite de {s.name} depuis {s.days} jours")
  })

  it("journée terminée : titre dédié et une action", () => {
    const m = buildTodayModel(data({ todayBookings: [booking({ status: "completed" })] }), ctx())
    expect(m.day?.next).toBeNull()
    expect(m.headline?.title).toBe("Journée terminée")
    expect(m.suggestion?.kind).toBe("share")
  })
})

describe("journée vide", () => {
  const next = { date: "2026-12-03", startTime: "09:00" }

  it("annonce le prochain rendez-vous (jour de la semaine, demain, date lointaine)", () => {
    expect(buildTodayModel(data({ nextBooking: next }), ctx()).headline).toEqual({ title: "Rien aujourd'hui", next: "jeudi à 09:00" })
    expect(buildTodayModel(data({ nextBooking: { date: "2026-11-28", startTime: "10:00" } }), ctx()).headline?.next).toBe("demain à 10:00")
    expect(buildTodayModel(data({ nextBooking: { date: "2026-12-10", startTime: "10:00" } }), ctx()).headline?.next).toBe("jeudi 10 décembre à 10:00")
    expect(buildTodayModel(data(), ctx()).headline?.next).toBeNull()
  })

  it("une seule action, dans l'ordre : relancer, partager, bloquer", () => {
    const lapsed = { name: "Julien Roux", bookingId: 42, lastDate: "2026-09-04" }
    expect(buildTodayModel(data({ lapsed, nextBooking: next }), ctx()).suggestion).toEqual({
      kind: "relaunch",
      name: "Julien Roux",
      days: 84,
      href: "/admin/clients/reservation/42",
    })
    expect(buildTodayModel(data(), ctx()).suggestion?.kind).toBe("share")
    expect(buildTodayModel(data({ nextBooking: next }), ctx()).suggestion).toEqual({ kind: "block", href: "/admin/parametres?tab=timeoff" })
  })
})

describe("à traiter", () => {
  it("rien à traiter : liste vide", () => {
    expect(buildTodayModel(data(), ctx()).todo).toEqual([])
  })

  it("une ligne par sujet, vers le bon écran", () => {
    const m = buildTodayModel(
      data({
        pendingDeposit: 2,
        requests: { newCount: 1, acceptedCount: 0, quoteSentCount: 3, firstActionId: 7 },
        unpaid: { count: 2, cents: 18000, currencies: ["EUR"], firstId: 5 },
        subscriptionRequests: 1,
        cancellationRequests: 1,
        leadsDue: 4,
      }),
      ctx(),
    )
    expect(m.todo.map((t) => [t.label, t.href])).toEqual([
      ["2 réservations en attente d'acompte", "/admin/reservations"],
      ["1 demande spéciale à traiter", "/admin/demandes/7"],
      ["3 devis en attente de réponse", "/admin/demandes"],
      ["2 factures à encaisser", "/admin/factures"],
      ["1 demande d'abonnement", "/admin/abonnements-clients"],
      ["1 demande de résiliation", "/admin/abonnements-clients"],
      ["4 prospects à relancer", "/admin/leads?due=1"],
    ])
    expect(m.todo[3].detail?.replace(/\s/g, " ")).toBe("180,00 €")
  })

  it("plusieurs devises : aucun total inventé", () => {
    const m = buildTodayModel(data({ unpaid: { count: 2, cents: 18000, currencies: ["EUR", "CHF"], firstId: 5 } }), ctx())
    expect(m.todo[0].detail).toBeNull()
  })
})

describe("chiffres", () => {
  const figures = {
    monthStart: "2026-11-01",
    monthEnd: "2026-11-30",
    prevStart: "2026-10-01",
    prevEnd: "2026-10-31",
    revenueCents: 124000,
    prevRevenueCents: 109000,
    bookings: 18,
    prevBookings: 15,
    payments: [],
    visits30: 42,
  }

  it("sans business_stats : aucun bloc", () => {
    const m = buildTodayModel(data({ figures: null }), ctx())
    expect(m.figures).toBeNull()
    expect(m.visits).toBeNull()
  })

  it("sans paiements en ligne : pas d'« Encaissé »", () => {
    const m = buildTodayModel(data({ figures }), ctx())
    expect(m.figures?.map((f) => f.label)).toEqual(["CA facturé ce mois", "Rendez-vous ce mois"])
    expect(m.figures?.[0].previous.replace(/\s/g, " ")).toBe("oct. : 1 090 €")
    expect(m.visits).toBe(42)
  })

  it("paiements en ligne : « Encaissé » (reçu moins remboursé), jamais 0,00 €", () => {
    const payments = [
      { status: "partially_refunded", grossAmountCents: 40000, refundedAmountCents: 9000, paidAt: "2026-11-05T10:00:00", refundedAt: "2026-11-06T10:00:00" },
    ]
    const m = buildTodayModel(data({ figures: { ...figures, payments } }), ctx({ paymentsEnabled: true }))
    const paid = m.figures?.find((f) => f.label === "Encaissé ce mois")
    expect(paid?.value.replace(/\s/g, " ")).toBe("310 €")
    expect(paid?.previous).toBe("oct. : —")
  })

  it("tout est nul : bloc absent", () => {
    const zero = { ...figures, revenueCents: 0, prevRevenueCents: 0, bookings: 0, prevBookings: 0, visits30: 0 }
    const m = buildTodayModel(data({ figures: zero }), ctx({ paymentsEnabled: true }))
    expect(m.figures).toBeNull()
    expect(m.visits).toBeNull()
  })
})

describe("terminer et encaisser", () => {
  it("échec du statut : aucune facture", async () => {
    const createInvoice = vi.fn()
    const r = await finishAndInvoice(1, { updateStatus: async () => ({ ok: false, error: "Transition non autorisée." }), createInvoice })
    expect(r).toEqual({ ok: false, completed: false, error: "Transition non autorisée." })
    expect(createInvoice).not.toHaveBeenCalled()
  })

  it("succès : statut « completed » puis facture de la même réservation", async () => {
    const calls: unknown[] = []
    const r = await finishAndInvoice(9, {
      updateStatus: async (id, s) => (calls.push([id, s]), { ok: true }),
      createInvoice: async (id) => (calls.push([id]), { ok: true, data: { invoiceId: 33 } }),
    })
    expect(r).toEqual({ ok: true, invoiceId: 33 })
    expect(calls).toEqual([[9, "completed"], [9]])
  })

  it("facture refusée (quota) ou exception : la visite reste terminée, l'erreur est rendue", async () => {
    const ok = async () => ({ ok: true })
    expect(await finishAndInvoice(1, { updateStatus: ok, createInvoice: async () => ({ ok: false, error: "Quota atteint." }) })).toEqual({
      ok: false,
      completed: true,
      error: "Quota atteint.",
    })
    const thrown = await finishAndInvoice(1, { updateStatus: ok, createInvoice: async () => Promise.reject(new Error("réseau")) })
    expect(thrown).toMatchObject({ ok: false, completed: true })
  })
})
