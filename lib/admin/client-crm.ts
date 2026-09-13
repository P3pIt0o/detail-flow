/**
 * Helpers PURS du mini-CRM « fiches clients » (LOT clients v1).
 *
 * Aucune dépendance base/serveur : ce module est importable par le serveur ET
 * par les tests unitaires (sans DB). Il centralise la SÉMANTIQUE du
 * rapprochement client et des indicateurs, pour être prouvable unitairement.
 *
 * Invariants (voir la mission) :
 *  - Rapprochement PRIORITAIRE sur l'email normalisé, repli sur le téléphone.
 *  - Un téléphone identique MAIS un email contradictoire ne fusionne jamais :
 *    l'entité est marquée « à vérifier » (review), jamais agrégée aux totaux.
 *  - « Montant réservé » = somme des réservations NON annulées et NON
 *    marquées comme données de démonstration (jamais « CA » ni « encaissé »).
 *  - « Encaissé net » = paiements réellement encaissés − remboursements, via
 *    la relation fiable bookingId (jamais un rapprochement par coordonnées).
 *
 * Ce module ne contient AUCUNE condition propre à un tenant (aucune clé de site
 * codée en dur) : il s'applique à toutes les entreprises de la même façon.
 */

import { COLLECTED_STATUSES } from "@/lib/admin/financials"

/** Normalise un email pour le rapprochement (minuscule, sans espaces). null si vide. */
export function normalizeEmail(email?: string | null): string | null {
  const v = (email ?? "").trim().toLowerCase()
  return v || null
}

/**
 * Normalise un téléphone pour le rapprochement : chiffres uniquement.
 * Cohérent avec l'anti-doublon existant des fiches clients. null si vide.
 */
export function normalizePhone(phone?: string | null): string | null {
  const v = (phone ?? "").replace(/\D/g, "")
  return v || null
}

/** Coordonnées normalisées d'un point d'ancrage (fiche ou réservation). */
export interface AnchorContact {
  email: string | null
  phone: string | null
}

/** Coordonnées BRUTES d'une entité candidate (réservation, demande, fiche). */
export interface RawContact {
  email?: string | null
  phone?: string | null
}

export type MatchResult = "match" | "review" | "none"

/**
 * Classe une entité vis-à-vis de l'ancre :
 *  - "match"  : email identique, OU téléphone identique sans email contradictoire ;
 *  - "review" : téléphone identique MAIS email présent et différent → à vérifier ;
 *  - "none"   : aucun rapprochement fiable.
 *
 * `anchor` est fourni DÉJÀ normalisé ; l'entité est normalisée ici.
 */
export function classifyMatch(anchor: AnchorContact, entity: RawContact): MatchResult {
  const ee = normalizeEmail(entity.email)
  const ep = normalizePhone(entity.phone)
  const emailMatch = anchor.email != null && ee != null && ee === anchor.email
  if (emailMatch) return "match"
  const phoneMatch = anchor.phone != null && ep != null && ep === anchor.phone
  if (phoneMatch) {
    // Téléphone identique : conflit d'email explicite => ne jamais fusionner.
    if (anchor.email != null && ee != null && ee !== anchor.email) return "review"
    return "match"
  }
  return "none"
}

/** Réservation minimale pour le calcul du « Montant réservé ». */
export interface ReservedBookingRow {
  status: string
  isDemoData: boolean
  totalCents: number
}

/**
 * « Montant réservé » : somme des réservations NON annulées et NON démo.
 * Ne JAMAIS présenter cette valeur comme « CA », « encaissé » ou « dépensé ».
 */
export function sumReservedCents(bookings: ReservedBookingRow[]): number {
  return bookings
    .filter((b) => b.status !== "cancelled" && !b.isDemoData)
    .reduce((sum, b) => sum + (Number(b.totalCents) || 0), 0)
}

/** Paiement minimal pour le calcul de l'encaissé net. */
export interface CollectedPaymentRow {
  status: string
  grossAmountCents: number
  refundedAmountCents: number
}

const COLLECTED_SET = new Set<string>(COLLECTED_STATUSES)

/**
 * « Encaissé net » = somme des paiements réellement encaissés (statuts
 * COLLECTED_STATUSES) diminuée des remboursements agrégés sur CHAQUE paiement.
 * Un paiement = une ligne (unicité provider+externalId en base) : aucun double
 * comptage possible. Les remboursements sont pris depuis `refundedAmountCents`
 * (agrégat de vérité recalculé par le module remboursements), jamais re-sommés
 * depuis la table refunds pour éviter tout double comptage.
 */
export function sumCollectedNetCents(payments: CollectedPaymentRow[]): number {
  let net = 0
  for (const p of payments) {
    if (COLLECTED_SET.has(p.status)) {
      net += (Number(p.grossAmountCents) || 0) - (Number(p.refundedAmountCents) || 0)
    }
  }
  return net
}

/** Véhicule connu, reconstruit depuis les snapshots (jamais une table dédiée). */
export interface KnownVehicle {
  type: string | null
  brand: string | null
  model: string | null
  plate: string | null
  /** Dernière date connue (YYYY-MM-DD) où ce véhicule est apparu. */
  lastDate: string | null
}

/** Libellé lisible d'un véhicule (marque/modèle, sinon type). */
export function vehicleLabel(v: KnownVehicle): string {
  const brandModel = [v.brand, v.model].map((s) => (s ?? "").trim()).filter(Boolean).join(" ")
  return brandModel || (v.type ?? "").trim() || "Véhicule"
}

function vehicleKey(v: KnownVehicle): string {
  const plate = (v.plate ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase()
  if (plate) return `plate:${plate}`
  return `id:${[(v.brand ?? ""), (v.model ?? ""), (v.type ?? "")].map((s) => s.trim().toLowerCase()).join("|")}`
}

/**
 * Déduplique l'AFFICHAGE des véhicules quand il s'agit manifestement du même
 * véhicule (immatriculation identique, sinon marque/modèle/type identiques).
 * Conserve la date la plus récente et complète les champs manquants.
 */
export function dedupeVehicles(list: KnownVehicle[]): KnownVehicle[] {
  const map = new Map<string, KnownVehicle>()
  for (const v of list) {
    // Une entrée totalement vide n'apporte rien : on l'ignore.
    if (!v.plate && !v.brand && !v.model && !v.type) continue
    const key = vehicleKey(v)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { ...v })
      continue
    }
    existing.brand = existing.brand ?? v.brand
    existing.model = existing.model ?? v.model
    existing.type = existing.type ?? v.type
    existing.plate = existing.plate ?? v.plate
    if (v.lastDate && (!existing.lastDate || v.lastDate > existing.lastDate)) {
      existing.lastDate = v.lastDate
    }
  }
  return [...map.values()].sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""))
}

/** Nombre de jours entiers écoulés depuis une date (YYYY-MM-DD), ou null. */
export function daysSince(date: string | null, now: Date = new Date()): number | null {
  if (!date) return null
  const then = new Date(`${date.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(then.getTime())) return null
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00`)
  const diff = Math.round((today.getTime() - then.getTime()) / 86_400_000)
  return diff >= 0 ? diff : 0
}
