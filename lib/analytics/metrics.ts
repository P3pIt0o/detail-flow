/**
 * Module Analyse — CALCULS MÉTIER PURS (aucune dépendance base/serveur).
 *
 * Chaque fonction reçoit des lignes DÉJÀ scopées par tenant (companyId résolu
 * côté serveur en amont) et retourne une métrique déterministe et testable.
 * Aucune règle financière n'est redéfinie ici : le CA facturé provient des
 * expressions SQL partagées (`lib/finance/revenue-sql.ts`) ; ce module ne
 * couvre que des dérivés (panier moyen, annulation, clients, prestations).
 */

import { normalizeEmail, normalizePhone } from "@/lib/admin/client-crm"

/* ------------------------------ CA (signe) ------------------------------- */

/**
 * Somme signée du CA net à partir de documents DÉJÀ filtrés « comptant dans le
 * CA » : facture = +total, avoir (credit_note) = −total. Reproduit exactement la
 * règle de signe de `netRevenueSumExpr` (source de vérité SQL) pour prouver
 * unitairement le cas facture 500 € − avoir 100 € = 400 €.
 */
export function sumNetRevenueCents(docs: { documentType: string; totalCents: number }[]): number {
  let total = 0
  for (const d of docs) {
    total += d.documentType === "credit_note" ? -d.totalCents : d.totalCents
  }
  return total
}

/* ------------------------------ Panier moyen ----------------------------- */

/**
 * Panier moyen = montant moyen des FACTURES clients PAYÉES, HORS avoirs, sur la
 * période. `null` si aucune facture (jamais 0 € trompeur). Arrondi au centime.
 */
export function averageBasketCents(input: {
  paidInvoiceTotalCents: number
  paidInvoiceCount: number
}): number | null {
  if (input.paidInvoiceCount <= 0) return null
  return Math.round(input.paidInvoiceTotalCents / input.paidInvoiceCount)
}

/* ------------------------------ Rendez-vous ------------------------------ */

/**
 * Comptage des rendez-vous par catégorie de statut sur la période.
 *  - `completed` + `confirmed` = rendez-vous RÉELS (réalisés ou à venir) ;
 *  - `cancelled` = annulés ;
 *  - `pendingDeposit` = en attente d'acompte (PAS encore un vrai RDV, exclu du
 *    total et du dénominateur d'annulation).
 */
export type AppointmentCounts = {
  completed: number
  confirmed: number
  cancelled: number
  pendingDeposit: number
}

/** Total des rendez-vous réels (confirmés + réalisés). */
export function appointmentsTotal(c: AppointmentCounts): number {
  return c.completed + c.confirmed
}

/**
 * Taux d'annulation = annulés / (confirmés + réalisés + annulés), en %.
 * Dénominateur = rendez-vous « programmés » (hors pending_deposit, jamais un
 * vrai RDV). `null` si aucun rendez-vous programmé (rien à mesurer).
 */
export function cancellationRate(c: AppointmentCounts): number | null {
  const denom = c.completed + c.confirmed + c.cancelled
  if (denom <= 0) return null
  return Math.round((c.cancelled / denom) * 100)
}

/** Dénominateur explicite du taux d'annulation (réutilisé par les seuils d'insight). */
export function scheduledAppointments(c: AppointmentCounts): number {
  return c.completed + c.confirmed + c.cancelled
}

/* -------------------------------- Clients -------------------------------- */

/**
 * Clé d'identité client, PRIORITÉ à l'email normalisé, repli sur le téléphone —
 * cohérent avec le rapprochement du mini-CRM (`lib/admin/client-crm.ts`). On ne
 * compte JAMAIS `customerName` (deux personnes peuvent partager un nom).
 * `null` = aucune coordonnée fiable → la ligne est ignorée des statistiques.
 */
export function clientIdentityKey(contact: { email?: string | null; phone?: string | null }): string | null {
  const email = normalizeEmail(contact.email)
  if (email) return `email:${email}`
  const phone = normalizePhone(contact.phone)
  if (phone) return `phone:${phone}`
  return null
}

export type ClientBookingRow = {
  email: string | null
  phone: string | null
  /** Date du rendez-vous `YYYY-MM-DD`. */
  date: string
  status: string
  isDemoData?: boolean
}

export type ClientStats = {
  /** Clients actifs sur la période (au moins 1 RDV non annulé dans l'intervalle). */
  activeClients: number
  /** Premier RDV non annulé dans la période. */
  newClients: number
  /** Activité avant la période ET pendant la période. */
  returningClients: number
}

/**
 * Classe les clients en nouveaux / récurrents sur `[start, end]`.
 *
 * Définitions (testées) :
 *  - on ignore les réservations annulées, de démonstration, ou sans identité ;
 *  - « nouveau »   : le PREMIER rendez-vous (non annulé) du client tombe dans la
 *    période ;
 *  - « récurrent » : le client a une activité AVANT la période ET pendant ;
 *  - « actif »     : au moins un rendez-vous dans la période (= nouveaux + récurrents).
 *
 * `rows` doit contenir l'historique jusqu'à `end` inclus (le serveur ne charge
 * pas au-delà). Complexité O(n) : aucune requête N+1.
 */
export function classifyClients(rows: ClientBookingRow[], range: { start: string; end: string }): ClientStats {
  // Par identité : première date connue + présence d'un RDV dans la période.
  const firstDate = new Map<string, string>()
  const inPeriod = new Map<string, boolean>()

  for (const r of rows) {
    if (r.status === "cancelled" || r.isDemoData) continue
    const key = clientIdentityKey({ email: r.email, phone: r.phone })
    if (!key) continue
    const d = r.date.slice(0, 10)
    const prev = firstDate.get(key)
    if (prev === undefined || d < prev) firstDate.set(key, d)
    if (d >= range.start && d <= range.end) inPeriod.set(key, true)
  }

  let activeClients = 0
  let newClients = 0
  let returningClients = 0
  for (const [key, active] of inPeriod) {
    if (!active) continue
    activeClients++
    const first = firstDate.get(key)!
    if (first >= range.start) newClients++
    else returningClients++
  }
  return { activeClients, newClients, returningClients }
}

/* ------------------------------ Prestations ------------------------------ */

export type ServiceShare = { name: string; value: number; share: number }

/**
 * Convertit des comptes/montants bruts par prestation en parts (%) triées
 * décroissant. `value` est générique (nombre de RDV OU CA en centimes selon
 * l'appelant — jamais mélangés). `share` = part arrondie du total (0 si total nul).
 */
export function toShares(rows: { name: string; value: number }[]): ServiceShare[] {
  const total = rows.reduce((s, r) => s + r.value, 0)
  return rows
    .filter((r) => r.value > 0)
    .map((r) => ({ name: r.name, value: r.value, share: total > 0 ? Math.round((r.value / total) * 100) : 0 }))
    .sort((a, b) => b.value - a.value)
}

/* -------------------------------- Site ----------------------------------- */

/**
 * Taux de conversion réservation = réservations terminées / visiteurs uniques,
 * en % (une décimale). `null` si pas de visiteur (rien à diviser). On ne
 * confond JAMAIS un clic de réservation avec une réservation terminée.
 */
export function conversionRate(bookingsCompleted: number, uniqueVisitors: number): number | null {
  if (uniqueVisitors <= 0) return null
  return Math.round((bookingsCompleted / uniqueVisitors) * 1000) / 10
}

/* ----------------------------- Rentabilité ------------------------------- */

/** Résultat estimé = CA facturé − achats produits enregistrés (jamais « bénéfice net »). */
export function estimatedResultCents(invoicedRevenueCents: number, productCostsCents: number): number {
  return invoicedRevenueCents - productCostsCents
}
