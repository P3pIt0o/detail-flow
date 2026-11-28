/**
 * L96 — Écran « Aujourd'hui » : composition PURE (aucune base, aucun réseau).
 *
 * Reçoit les données réelles du tenant (lues par `today-query.ts`) et décide ce
 * que l'écran montre : étapes de démarrage, prochain rendez-vous, journée vide,
 * « À traiter » et chiffres. Un bloc sans contenu est absent (jamais vide).
 */

import { getCustomSiteAdminProfile } from "@/lib/admin/custom-site-admin-profile"
import { computeMonthlyFinancials, type PaymentRow } from "@/lib/admin/financials"
import { isWorkshopAddressComplete } from "@/lib/booking/location-shared"
import { buildMapsDirectionsUrl } from "@/lib/notifications/maps"
import type { OnboardingIntentValue } from "@/lib/onboarding/intent"

/** Absence (en jours) à partir de laquelle un client est proposé à la relance (seuil de la fiche client). */
export const RELAUNCH_AFTER_DAYS = 60

export type TodayBooking = {
  id: number
  customerName: string
  customerPhone: string | null
  address: string | null
  startTime: string
  status: string
  totalCents: number
  depositCents: number
  /** Paiements en ligne de ce rendez-vous (reçu moins remboursé). */
  paidOnlineCents: number
  isDemo: boolean
  locationType: string | null
  items: { service: string | null; brand: string | null; model: string | null; type: string | null }[]
}

export type TodayFigures = {
  monthStart: string
  monthEnd: string
  prevStart: string
  prevEnd: string
  revenueCents: number
  prevRevenueCents: number
  bookings: number
  prevBookings: number
  payments: PaymentRow[]
  visits30: number
}

export type TodayData = {
  /** Date du jour dans le fuseau de l'entreprise (AAAA-MM-JJ). */
  today: string
  settings: {
    businessName: string | null
    businessPhone: string | null
    businessAddress: string | null
    billingConfirmed: boolean
    mobileEnabled: boolean
    workshopEnabled: boolean
    workshopAddress: string
    workshopPostalCode: string
    workshopCity: string
    /** Adresse de départ géolocalisée (nécessaire au déplacement). */
    hasBaseLocation: boolean
    /** TVA activée : la facture l'ajoute au total de la réservation. */
    vatEnabled: boolean
  }
  serviceCount: number
  vehicleTypeCount: number
  openDayCount: number
  publishedPage: boolean
  /** Au moins une vraie réservation (hors démonstration). */
  hasBooking: boolean
  todayBookings: TodayBooking[]
  nextBooking: { date: string; startTime: string } | null
  lapsed: { name: string; bookingId: number; lastDate: string } | null
  pendingDeposit: number
  requests: { newCount: number; acceptedCount: number; quoteSentCount: number; firstActionId: number | null }
  unpaid: { count: number; cents: number; currencies: string[]; firstId: number | null }
  subscriptionRequests: number
  cancellationRequests: number
  leadsDue: number
  /** null sans le droit `business_stats`. */
  figures: TodayFigures | null
}

export type TodayContext = {
  /** Ajoute le paramètre tenant aux liens internes. */
  href: (path: string) => string
  intent: OnboardingIntentValue | null
  customSiteKey: string | null
  distributionMode: string | null
  /** Texte de présentation du site renseigné (parcours historique). */
  siteTextComplete: boolean
  paymentsEnabled: boolean
  /** Lien public à partager, résolu côté serveur. */
  shareUrl: string
}

export type SetupStep = {
  key: "company" | "service" | "hours" | "page" | "share"
  title: string
  done: boolean
  /** null : l'étape se fait sur place (partage du lien). */
  href: string | null
}

export type Appointment = {
  id: number
  time: string
  name: string
  phone: string | null
  vehicle: string | null
  services: string
  address: string | null
  atWorkshop: boolean
  mapsUrl: string | null
  status: string
  canFinish: boolean
  /** Montant affiché sur le bouton ; null si TVA, acompte ou paiement en ligne rendent le reste incertain ici. */
  amountCents: number | null
  paidOnlineCents: number
  /** Total (sans TVA à ajouter) déjà réglé en ligne : ne rien encaisser. */
  paidInFull: boolean
  /** Avertissements affichés avant de confirmer. */
  paymentNotes: string[]
  href: string
}

export type Suggestion =
  | { kind: "relaunch"; name: string; days: number; href: string }
  | { kind: "share" }
  | { kind: "block"; href: string }

export type TodoItem = { label: string; detail: string | null; action: string; href: string }

export type Figure = { label: string; value: string; previous: string; hint: string }

export type TodayModel = {
  dateLabel: string
  setup: { steps: SetupStep[]; doneCount: number } | null
  day: { next: Appointment | null; list: Appointment[] } | null
  headline: { title: string; next: string | null } | null
  suggestion: Suggestion | null
  todo: TodoItem[]
  figures: Figure[] | null
  visits: number | null
  shareUrl: string
}

const filled = (v: string | null | undefined) => Boolean(v && v.trim())
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`)
const daysBetween = (from: string, to: string) => Math.round((day(to).getTime() - day(from).getTime()) / 86_400_000)
const fr = (ymd: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: "UTC" }).format(day(ymd))
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** Montant compact : sans décimales quand il est rond, « — » quand il est nul. */
function money(cents: number): string {
  if (cents === 0) return "—"
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

function nextLabel(next: { date: string; startTime: string }, today: string): string {
  const gap = daysBetween(today, next.date)
  const when =
    gap === 1
      ? "demain"
      : gap < 7
        ? fr(next.date, { weekday: "long" })
        : fr(next.date, { weekday: "long", day: "numeric", month: "long" })
  return `${when} à ${next.startTime}`
}

/**
 * Le lien de réservation fonctionne toujours ; la page d'accueil du pro n'est
 * partagée que si elle est publiée et fait partie de son parcours.
 */
export function shouldShareReservation(p: {
  publishedPage: boolean
  intent: OnboardingIntentValue | null
  distributionMode: string | null
  customSiteKey: string | null
}): boolean {
  return (
    !p.publishedPage ||
    p.intent === "booking_only" ||
    p.intent === "custom_website" ||
    p.distributionMode === "widget" ||
    Boolean(p.customSiteKey)
  )
}

function setupSteps(data: TodayData, ctx: TodayContext): SetupStep[] {
  const s = data.settings
  const identity = filled(s.businessName) && filled(s.businessPhone) && filled(s.businessAddress)
  // Même règle que `getBookingSetupStatus` (section « Lieu »).
  const location =
    (s.mobileEnabled || s.workshopEnabled) &&
    (!s.mobileEnabled || s.hasBaseLocation) &&
    (!s.workshopEnabled || isWorkshopAddressComplete(s))
  const steps: SetupStep[] = [
    {
      key: "company",
      title: "Compléter mon entreprise",
      done: identity && location,
      href: ctx.href(`/admin/parametres?tab=${identity && !location ? "travel" : "business"}`),
    },
    {
      key: "service",
      title: "Créer ma première prestation",
      done: data.serviceCount > 0 && data.vehicleTypeCount > 0,
      href: ctx.href("/admin/prestations"),
    },
    { key: "hours", title: "Définir mes horaires", done: data.openDayCount > 0, href: ctx.href("/admin/parametres?tab=hours") },
  ]

  // « Page en ligne » : seulement si le parcours choisi passe par une page DetailFlow.
  const hasPage = !ctx.customSiteKey && ctx.distributionMode !== "widget"
  if (hasPage && ctx.intent === "public_page") {
    steps.push({ key: "page", title: "Mettre ma page en ligne", done: data.publishedPage, href: ctx.href("/admin/page-publique") })
  } else if (hasPage && ctx.intent === null) {
    steps.push({
      key: "page",
      title: "Compléter ma page en ligne",
      done: ctx.siteTextComplete && filled(s.businessPhone),
      href: ctx.href("/admin/parametres?tab=site"),
    })
  }

  // L116 : pas d'invitation à partager quand le profil du site sur mesure la masque.
  if (!getCustomSiteAdminProfile(ctx.customSiteKey).hideShareActions) {
    steps.push({ key: "share", title: "Partager votre lien", done: data.hasBooking, href: null })
  }
  return steps
}

/**
 * Ce que la facture créée depuis la réservation déduit : l'acompte PRÉVU
 * (`depositCents`), reçu ou non, et aucun autre paiement en ligne.
 */
function paymentNotes(depositCents: number, paidOnlineCents: number): string[] {
  const notes: string[] = []
  if (paidOnlineCents > depositCents) {
    notes.push(
      `La facture ne déduit pas ${money(paidOnlineCents - depositCents)} déjà payés en ligne : ne les encaissez pas une seconde fois.`,
    )
  } else if (depositCents > paidOnlineCents) {
    notes.push(
      `La facture déduit un acompte de ${money(depositCents)} non reçu en totalité en ligne : vérifiez que vous l'avez bien encaissé.`,
    )
  } else if (depositCents > 0) {
    notes.push(`L'acompte de ${money(depositCents)} payé en ligne est déjà déduit de la facture.`)
  }
  return notes
}

function appointment(b: TodayData["todayBookings"][number], data: TodayData, ctx: TodayContext): Appointment {
  // Lieu enregistré sur le rendez-vous, sinon réglage de l'entreprise.
  const atWorkshop = b.locationType ? b.locationType === "workshop" : !data.settings.mobileEnabled
  const vehicles = b.items.map((i) => [i.brand, i.model].filter(Boolean).join(" ").trim() || i.type || "").filter(Boolean)
  const services = b.items.map((i) => i.service ?? "").filter(Boolean)
  const address = !atWorkshop && filled(b.address) ? b.address : null
  return {
    id: b.id,
    time: b.startTime,
    name: b.customerName,
    phone: filled(b.customerPhone) ? b.customerPhone : null,
    vehicle: Array.from(new Set(vehicles)).join(", ") || null,
    services: Array.from(new Set(services)).join(" · "),
    address,
    atWorkshop,
    mapsUrl: address ? buildMapsDirectionsUrl(address) : null,
    status: b.status,
    // Démonstration : terminer enverrait un e-mail et créerait une vraie facture.
    canFinish: b.status === "confirmed" && !b.isDemo,
    amountCents:
      data.settings.vatEnabled || b.paidOnlineCents > 0 || b.depositCents > 0 || b.totalCents <= 0 ? null : b.totalCents,
    paidOnlineCents: b.paidOnlineCents,
    paidInFull: !data.settings.vatEnabled && b.totalCents > 0 && b.paidOnlineCents >= b.totalCents,
    paymentNotes: paymentNotes(b.depositCents, b.paidOnlineCents),
    href: ctx.href(`/admin/reservations/${b.id}`),
  }
}

function suggestion(data: TodayData, ctx: TodayContext, hasUpcoming: boolean): Suggestion | null {
  if (data.lapsed) {
    return {
      kind: "relaunch",
      name: data.lapsed.name,
      days: daysBetween(data.lapsed.lastDate, data.today),
      href: ctx.href(`/admin/clients/reservation/${data.lapsed.bookingId}`),
    }
  }
  // Après une journée travaillée, proposer de la bloquer n'a pas de sens.
  if (!hasUpcoming || data.todayBookings.length > 0) {
    // L116 : partage masqué => suggestion retirée, sans remplacement.
    return getCustomSiteAdminProfile(ctx.customSiteKey).hideShareActions ? null : { kind: "share" }
  }
  return { kind: "block", href: ctx.href("/admin/parametres?tab=timeoff") }
}

function todoItems(data: TodayData, ctx: TodayContext): TodoItem[] {
  const items: TodoItem[] = []
  const add = (n: number, label: string, path: string, action: string, detail: string | null = null) => {
    if (n > 0) items.push({ label, detail, action, href: ctx.href(path) })
  }

  const deposits = data.pendingDeposit
  add(deposits, `${plural(deposits, "réservation", "réservations")} en attente d'acompte`, "/admin/reservations", "Voir")

  const { newCount, acceptedCount, quoteSentCount, firstActionId } = data.requests
  const actions = newCount + acceptedCount
  add(
    actions,
    `${plural(actions, "demande spéciale", "demandes spéciales")} à traiter`,
    actions === 1 && firstActionId ? `/admin/demandes/${firstActionId}` : "/admin/demandes",
    "Répondre",
  )
  add(quoteSentCount, `${quoteSentCount} devis en attente de réponse`, "/admin/demandes", "Voir")

  const { count, cents, currencies, firstId } = data.unpaid
  add(
    count,
    `${plural(count, "facture", "factures")} à encaisser`,
    count === 1 && firstId ? `/admin/factures/${firstId}` : "/admin/factures",
    "Voir",
    // Plusieurs devises (ou une autre que l'euro) : aucun total, aucune conversion.
    currencies.length === 1 && currencies[0] === "EUR"
      ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
      : null,
  )

  const subs = data.subscriptionRequests
  add(subs, plural(subs, "demande d'abonnement", "demandes d'abonnement"), "/admin/abonnements-clients", "Répondre")
  const stops = data.cancellationRequests
  add(stops, plural(stops, "demande de résiliation", "demandes de résiliation"), "/admin/abonnements-clients", "Répondre")
  add(data.leadsDue, `${plural(data.leadsDue, "prospect", "prospects")} à relancer`, "/admin/leads?due=1", "Voir")

  if (data.hasBooking && !data.settings.billingConfirmed) {
    items.push({
      label: "Facturation à compléter",
      detail: "Vos infos légales et votre TVA",
      action: "Compléter",
      href: ctx.href("/admin/parametres?tab=invoicing"),
    })
  }
  return items
}

function figures(f: TodayFigures, ctx: TodayContext): { figures: Figure[] | null; visits: number | null } {
  const collected = (start: string, end: string) =>
    computeMonthlyFinancials({ invoicedRevenueCents: 0, productCostsCents: 0, payments: f.payments, start, end })
      .collectedNetCents
  const paid = collected(f.monthStart, f.monthEnd)
  const prevPaid = collected(f.prevStart, f.prevEnd)
  const month = fr(f.prevStart, { month: "short" })
  const visits = f.visits30 > 0 ? f.visits30 : null

  if (![f.revenueCents, f.prevRevenueCents, f.bookings, f.prevBookings, paid, prevPaid].some((n) => n !== 0)) {
    return { figures: null, visits }
  }

  const list: Figure[] = [
    {
      label: "CA facturé ce mois",
      value: money(f.revenueCents),
      previous: `${month} : ${money(f.prevRevenueCents)}`,
      hint: "Factures payées dont la prestation (à défaut l'émission) date de ce mois, moins les avoirs.",
    },
  ]
  if (ctx.paymentsEnabled || paid !== 0 || prevPaid !== 0) {
    list.push({
      label: "Encaissé ce mois",
      value: money(paid),
      previous: `${month} : ${money(prevPaid)}`,
      hint: "Paiements en ligne reçus ce mois, avant frais Stripe, moins les remboursements.",
    })
  }
  list.push({
    label: "Rendez-vous ce mois",
    value: f.bookings ? String(f.bookings) : "—",
    previous: `${month} : ${f.prevBookings || "—"}`,
    hint: "Rendez-vous du mois, hors annulés.",
  })
  return { figures: list, visits }
}

export function buildTodayModel(data: TodayData, ctx: TodayContext): TodayModel {
  const steps = setupSteps(data, ctx)
  // La liste de démarrage s'arrête à la première vraie réservation.
  const setup =
    data.hasBooking || steps.every((s) => s.done) ? null : { steps, doneCount: steps.filter((s) => s.done).length }
  // Compte établi : un réglage manquant devient une simple ligne « À traiter ».
  const missing: TodoItem[] = data.hasBooking
    ? steps.flatMap((s) =>
        !s.done && s.href
          ? [{ label: s.title, detail: "À compléter", action: s.key === "page" ? "Ouvrir" : "Régler", href: s.href }]
          : [],
      )
    : []

  const list = data.todayBookings.map((b) => appointment(b, data, ctx))
  const next = list.find((a) => a.status !== "completed") ?? null
  const dayModel = list.length > 0 ? { next, list } : null

  // Compte qui démarre sans aucun rendez-vous : seule la liste d'étapes a du sens.
  // L116 : sans étape restante (partage masqué), « Rien aujourd'hui » plutôt qu'un écran vide.
  const idle = !next && (setup === null || list.length > 0 || data.nextBooking !== null)

  const stats = data.figures ? figures(data.figures, ctx) : { figures: null, visits: null }
  const date = fr(data.today, { weekday: "long", day: "numeric", month: "long" })

  return {
    dateLabel: date.charAt(0).toUpperCase() + date.slice(1),
    setup,
    day: dayModel,
    headline: idle
      ? {
          title: list.length > 0 ? "Journée terminée" : "Rien aujourd'hui",
          next: data.nextBooking ? nextLabel(data.nextBooking, data.today) : null,
        }
      : null,
    suggestion: idle ? suggestion(data, ctx, data.nextBooking !== null) : null,
    todo: [...todoItems(data, ctx), ...missing],
    figures: stats.figures,
    visits: stats.visits,
    shareUrl: ctx.shareUrl,
  }
}

/* ------------------------------------------------------------------------- */
/*  « Terminer et encaisser » : enchaîne deux actions serveur existantes.     */
/* ------------------------------------------------------------------------- */

export type FinishResult =
  | { ok: true; invoiceId: number }
  /** `completed` : la visite est déjà terminée (ne pas rejouer le changement de statut). */
  | { ok: false; completed: boolean; error: string }

export async function finishAndInvoice(
  bookingId: number,
  actions: {
    updateStatus: (id: number, status: "completed") => Promise<{ ok: boolean; error?: string }>
    createInvoice: (id: number) => Promise<{ ok: boolean; error?: string; data?: { invoiceId: number } }>
  },
): Promise<FinishResult> {
  let completed = false
  try {
    const status = await actions.updateStatus(bookingId, "completed")
    if (!status.ok) return { ok: false, completed, error: status.error ?? "La visite n'a pas pu être terminée." }
    completed = true
    const invoice = await actions.createInvoice(bookingId)
    if (!invoice.ok || !invoice.data) {
      return { ok: false, completed, error: invoice.error ?? "La facture n'a pas pu être créée." }
    }
    return { ok: true, invoiceId: invoice.data.invoiceId }
  } catch {
    return { ok: false, completed, error: "Une erreur est survenue. Vérifiez la réservation avant de réessayer." }
  }
}
