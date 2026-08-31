/**
 * Brouillon de réservation (LOT B, point 3) — logique PURE et testable, sans
 * dépendance au DOM. Le hook `use-booking-draft` s'appuie dessus pour le
 * stockage réel (sessionStorage par défaut, localStorage 24 h sur accord).
 *
 * Sécurité / vie privée :
 * - Aucune donnée bancaire ni secret n'est stocké (le paiement passe par le
 *   checkout embarqué Stripe : aucune donnée carte n'existe côté client).
 * - Aucune coordonnée n'est jamais placée dans une URL, un log ou un analytics.
 * - Le brouillon ne contient QUE ce que le client a saisi dans le tunnel.
 *
 * Revalidation : le brouillon N'EST PAS une réservation. Prix, promotion et
 * créneau sont TOUJOURS recalculés côté serveur à la création (source de
 * vérité). Un créneau mémorisé n'est jamais présenté comme réservé.
 */

import type { VehicleSelection } from "@/components/booking/shared"

/** Coordonnées client (miroir de `ContactData`, dupliqué ici pour éviter un
 * import client→lib inutile ; la forme reste alignée). */
export type DraftContact = {
  name: string
  email: string
  phone: string
  address: string
  notes: string
}

/**
 * Version du FORMAT de brouillon. Toute évolution incompatible de la forme du
 * tunnel (étapes, champs) DOIT incrémenter cette version : un ancien brouillon
 * d'une version différente est ignoré (jamais restauré de force).
 */
export const BOOKING_FORM_VERSION = 1

/** Durée de mémorisation « sur cet appareil » (24 h), en millisecondes. */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Réservation DÉJÀ créée côté serveur et en attente de paiement en ligne.
 * Permet de reprendre le PAIEMENT de la réservation existante (jamais d'en
 * recréer une) si le client abandonne Stripe ou revient en arrière.
 * Ne contient AUCUNE donnée bancaire : uniquement de quoi rouvrir la page de
 * paiement (référence + chemin), que le serveur revalide de toute façon.
 */
export type DraftPendingPayment = {
  /** Référence publique de la réservation créée. */
  reference: string
  /** Chemin RELATIF de reprise du paiement (jamais une URL absolue/externe). */
  payPath: string
}

export type BookingDraft = {
  /** Version du format (doit valoir BOOKING_FORM_VERSION pour être accepté). */
  v: number
  step: number
  vehicles: VehicleSelection[]
  date: string | null
  startTime: string | null
  contact: DraftContact
  /** Texte du code promo saisi (JAMAIS le montant de remise, revalidé serveur). */
  promoInput: string
  /**
   * Présent uniquement quand une réservation a été créée et attend son
   * paiement. Sa présence bascule la reprise en « Reprendre le paiement ».
   */
  pendingPayment?: DraftPendingPayment | null
  /** Horodatage d'enregistrement (epoch ms) pour le TTL 24 h. */
  savedAt: number
}

/**
 * Décide OÙ persister le brouillon (y compris `pendingPayment`), selon la règle
 * de consentement unique du LOT B :
 *  - localStorage 24 h UNIQUEMENT si le client a explicitement consenti
 *    (`remember`) ET que localStorage est disponible ;
 *  - sinon sessionStorage (reprise tant que l'onglet reste ouvert) ;
 *  - sinon `null` (aucun Storage : fonctionnement mémoire, non persistant).
 * Fonction PURE pour être testable sans DOM. Utilisée à l'identique par la
 * sauvegarde du brouillon ET par la bascule « en attente de paiement », afin
 * que `pendingPayment` suive EXACTEMENT la même politique de consentement.
 */
export function chooseDraftStorage(
  remember: boolean,
  canLocal: boolean,
  canSession: boolean,
): "localStorage" | "sessionStorage" | null {
  if (remember && canLocal) return "localStorage"
  if (canSession) return "sessionStorage"
  return null
}

/** Construit une clé de stockage isolée par tenant + version de formulaire. */
export function buildDraftKey(tenant: string | null | undefined, version = BOOKING_FORM_VERSION): string {
  const t = (tenant ?? "_").trim() || "_"
  return `df:booking:${t}:v${version}:draft`
}

/** Sérialise l'état du tunnel en chaîne JSON stockable. */
export function serializeDraft(
  input: Omit<BookingDraft, "v" | "savedAt">,
  now: number = Date.now(),
): string {
  const draft: BookingDraft = { ...input, v: BOOKING_FORM_VERSION, savedAt: now }
  return JSON.stringify(draft)
}

/** Valide un chemin de reprise de paiement : relatif, interne, sans schéma. */
function isSafePayPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("://") &&
    !value.toLowerCase().includes("javascript:")
  )
}

/**
 * Parse et VALIDE un brouillon brut. Retourne `null` si :
 * - JSON invalide,
 * - version incompatible,
 * - forme inattendue,
 * - âge supérieur à `maxAgeMs` (quand fourni, cas localStorage 24 h).
 * Ne restaure jamais un brouillon douteux (fail-safe).
 */
export function parseDraft(
  raw: string | null | undefined,
  opts: { maxAgeMs?: number; now?: number } = {},
): BookingDraft | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const d = parsed as Record<string, unknown>

  if (d.v !== BOOKING_FORM_VERSION) return null
  if (typeof d.savedAt !== "number" || !Number.isFinite(d.savedAt)) return null
  if (!Array.isArray(d.vehicles)) return null
  const contact = d.contact as Record<string, unknown> | undefined
  if (!contact || typeof contact !== "object") return null

  const now = opts.now ?? Date.now()
  if (opts.maxAgeMs != null && now - (d.savedAt as number) > opts.maxAgeMs) return null

  // Normalisation défensive : on ne fait confiance à aucun champ.
  const draft: BookingDraft = {
    v: BOOKING_FORM_VERSION,
    step: typeof d.step === "number" && d.step >= 0 ? Math.floor(d.step) : 0,
    vehicles: d.vehicles as VehicleSelection[],
    date: typeof d.date === "string" ? d.date : null,
    startTime: typeof d.startTime === "string" ? d.startTime : null,
    contact: {
      name: typeof contact.name === "string" ? contact.name : "",
      email: typeof contact.email === "string" ? contact.email : "",
      phone: typeof contact.phone === "string" ? contact.phone : "",
      address: typeof contact.address === "string" ? contact.address : "",
      notes: typeof contact.notes === "string" ? contact.notes : "",
    },
    promoInput: typeof d.promoInput === "string" ? d.promoInput : "",
    pendingPayment: null,
    savedAt: d.savedAt as number,
  }

  // pendingPayment est optionnel et strictement validé (fail-safe) : une valeur
  // douteuse est simplement ignorée (le brouillon reste utilisable).
  const pp = d.pendingPayment as Record<string, unknown> | null | undefined
  if (pp && typeof pp === "object" && typeof pp.reference === "string" && pp.reference.trim() && isSafePayPath(pp.payPath)) {
    draft.pendingPayment = { reference: pp.reference, payPath: pp.payPath }
  }

  return draft
}

/**
 * Un brouillon est « significatif » (donc digne d'une proposition de reprise)
 * seulement si le client a réellement commencé à composer sa réservation.
 * Évite de proposer « Reprendre » sur un tunnel vierge.
 */
export function isDraftMeaningful(draft: BookingDraft | null): boolean {
  if (!draft) return false
  // Une réservation en attente de paiement doit TOUJOURS pouvoir être reprise.
  if (draft.pendingPayment) return true
  const c = draft.contact
  const hasContact = Boolean(c.name.trim() || c.email.trim() || c.phone.trim() || c.address.trim())
  const hasVehicleDetails = draft.vehicles.some(
    (v) => v.vehicleTypeId != null || Boolean(v.brand?.trim()) || Boolean(v.model?.trim()) || v.services.some((l) => l.serviceId != null),
  )
  const hasSchedule = Boolean(draft.date || draft.startTime)
  return hasContact || hasVehicleDetails || hasSchedule || draft.step > 0
}
