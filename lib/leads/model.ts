/**
 * CRM PROSPECTS (leads) — MODÈLE PUR.
 *
 * Aucune dépendance base/serveur : importable côté serveur, côté client et dans
 * les tests unitaires. Centralise TOUTE la sémantique du CRM prospects :
 *  - statuts du pipeline + libellés FR (jamais de libellé FR stocké en base) ;
 *  - sources + libellés FR ;
 *  - types d'activité (historique) ;
 *  - la MACHINE de progression automatique (`advanceLeadStatus`) et les mappings
 *    depuis les demandes personnalisées et les réservations.
 *
 * Règle d'or : les synchronisations AUTOMATIQUES ne font jamais RÉGRESSER un
 * prospect (un CLIENT reste CLIENT ; un LOST ne se rouvre que MANUELLEMENT).
 */

/* ------------------------------- Statuts --------------------------------- */

export const LEAD_STATUSES = ["NEW", "CONTACTED", "APPOINTMENT_BOOKED", "CLIENT", "LOST"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  APPOINTMENT_BOOKED: "Rendez-vous pris",
  CLIENT: "Client",
  LOST: "Perdu",
}

/* ------------------------------- Sources --------------------------------- */

export const LEAD_SOURCES = ["MANUAL", "CUSTOM_REQUEST", "META", "IMPORT"] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  MANUAL: "Ajout manuel",
  CUSTOM_REQUEST: "Demande du site",
  META: "Meta",
  IMPORT: "Import",
}

/* --------------------------- Types d'activité ---------------------------- */

export const LEAD_ACTIVITY_TYPES = [
  "CREATED",
  "STATUS_CHANGED",
  "NOTE_ADDED",
  "FOLLOW_UP_SET",
  "FOLLOW_UP_CLEARED",
  "SOURCE_SYNCED",
  "BOOKING_LINKED",
  "REOPENED",
] as const
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number]

/* ---------------------------- Motifs de perte ---------------------------- */

export const LEAD_LOST_REASONS = ["price", "no_response", "abandoned", "competitor", "other"] as const
export type LeadLostReason = (typeof LEAD_LOST_REASONS)[number]

export const LEAD_LOST_REASON_LABELS: Record<LeadLostReason, string> = {
  price: "Prix",
  no_response: "Pas de réponse",
  abandoned: "Projet abandonné",
  competitor: "Concurrent",
  other: "Autre",
}

/* ------------------------------ Type guards ------------------------------ */

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v)
}
export function isLeadSource(v: unknown): v is LeadSource {
  return typeof v === "string" && (LEAD_SOURCES as readonly string[]).includes(v)
}
export function isLeadLostReason(v: unknown): v is LeadLostReason {
  return typeof v === "string" && (LEAD_LOST_REASONS as readonly string[]).includes(v)
}

/* --------------------------- Machine de statut --------------------------- */

/**
 * Rang du pipeline LINÉAIRE. LOST est une BRANCHE (hors ordre linéaire, rang -1)
 * et n'est jamais comparé par rang.
 */
const PIPELINE_RANK: Record<LeadStatus, number> = {
  NEW: 0,
  CONTACTED: 1,
  APPOINTMENT_BOOKED: 2,
  CLIENT: 3,
  LOST: -1,
}

/**
 * Progression AUTOMATIQUE (pilotée par les synchronisations). N'avance que vers
 * l'AVANT dans le pipeline et ne fait JAMAIS régresser :
 *  - un CLIENT reste CLIENT (terminal pour l'automatique) ;
 *  - un LOST reste LOST (réouverture MANUELLE uniquement, gérée hors de ce pur) ;
 *  - une source automatique PEUT marquer un prospect actif (non-client) comme
 *    perdu (ex. demande refusée) ;
 *  - sinon, on avance uniquement (jamais de recul).
 */
export function advanceLeadStatus(current: LeadStatus, incoming: LeadStatus): LeadStatus {
  if (current === incoming) return current
  if (current === "CLIENT") return "CLIENT"
  if (current === "LOST") return "LOST"
  if (incoming === "LOST") return "LOST"
  return PIPELINE_RANK[incoming] > PIPELINE_RANK[current] ? incoming : current
}

/**
 * Mapping `custom_requests.status` → statut CRM ENTRANT (avant `advanceLeadStatus`).
 * Une demande convertie / rattachée à une réservation vaut « rendez-vous pris ».
 */
export function mapCustomRequestStatus(status: string, hasBooking: boolean): LeadStatus {
  if (hasBooking || status === "converted") return "APPOINTMENT_BOOKED"
  switch (status) {
    case "proposal_sent":
      return "CONTACTED"
    case "accepted":
      return "CONTACTED"
    case "declined":
      return "LOST"
    case "new":
    default:
      return "NEW"
  }
}

/** Statut CRM résultant d'une synchro demande personnalisée (jamais de régression). */
export function nextStatusFromCustomRequest(
  current: LeadStatus,
  status: string,
  hasBooking: boolean,
): LeadStatus {
  return advanceLeadStatus(current, mapCustomRequestStatus(status, hasBooking))
}

/**
 * Statut CRM résultant d'une synchro RÉSERVATION sur un prospect FIABLEMENT lié.
 *  - confirmed  → rendez-vous pris ;
 *  - completed  → client ;
 *  - cancelled  → si le prospect n'était pas déjà CLIENT/LOST, retour à CONTACTED
 *                 (jamais LOST automatiquement) ;
 *  - pending_deposit / inconnu → aucun changement automatique.
 */
export function nextStatusFromBooking(current: LeadStatus, bookingStatus: string): LeadStatus {
  switch (bookingStatus) {
    case "confirmed":
      return advanceLeadStatus(current, "APPOINTMENT_BOOKED")
    case "completed":
      return advanceLeadStatus(current, "CLIENT")
    case "cancelled":
      if (current === "CLIENT" || current === "LOST") return current
      return "CONTACTED"
    case "pending_deposit":
    default:
      return current
  }
}

/* --------------------------- Relances (follow-up) ------------------------ */

export type FollowUpBucket = "overdue" | "today" | "upcoming" | "none"

/**
 * Classe une relance par rapport à la date métier du tenant (`todayYmd`), toutes
 * deux au format `YYYY-MM-DD`. PURE : la conversion fuseau est faite en amont
 * (voir `businessToday`, module Analyse) pour qu'« aujourd'hui » soit bien le
 * jour local de l'entreprise, jamais UTC.
 */
export function followUpBucket(followUpYmd: string | null, todayYmd: string): FollowUpBucket {
  if (!followUpYmd) return "none"
  const d = followUpYmd.slice(0, 10)
  if (d < todayYmd) return "overdue"
  if (d === todayYmd) return "today"
  return "upcoming"
}

export const FOLLOW_UP_BUCKET_LABELS: Record<Exclude<FollowUpBucket, "none">, string> = {
  overdue: "En retard",
  today: "Aujourd'hui",
  upcoming: "À venir",
}

/** Presets de relance proposés à l'utilisateur (jours à ajouter à aujourd'hui). */
export const FOLLOW_UP_PRESETS = [
  { key: "today", label: "Aujourd'hui", addDays: 0 },
  { key: "tomorrow", label: "Demain", addDays: 1 },
  { key: "in3days", label: "Dans 3 jours", addDays: 3 },
  { key: "in1week", label: "Dans 1 semaine", addDays: 7 },
] as const
export type FollowUpPresetKey = (typeof FOLLOW_UP_PRESETS)[number]["key"]

/** Ajoute `days` jours à une date `YYYY-MM-DD` (calcul civil pur, UTC neutre). */
export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ymd
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Instant UTC correspondant au DÉBUT du jour local `ymd` (`YYYY-MM-DD`) dans le
 * fuseau `timeZone` du tenant. PURE (Intl uniquement). Sert à stocker/comparer
 * une relance dans le bon fuseau : « aujourd'hui » = jour local de l'entreprise,
 * jamais UTC. Repli sûr sur minuit UTC si le fuseau est invalide.
 */
export function zonedStartOfDayUtc(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  const utcGuess = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0)
  try {
    const asUtc = new Date(utcGuess)
    const local = new Date(asUtc.toLocaleString("en-US", { timeZone }))
    const utc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }))
    const offset = local.getTime() - utc.getTime()
    return new Date(utcGuess - offset)
  } catch {
    return new Date(utcGuess)
  }
}
