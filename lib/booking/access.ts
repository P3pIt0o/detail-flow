import "server-only"

/**
 * ============================================================================
 *  ACCÈS PUBLIC À UNE RÉSERVATION (client final non authentifié)
 * ============================================================================
 *  La référence « DF-AAAAMMJJ-NNNN » est un identifiant d'AFFICHAGE (emails,
 *  admin, factures). Elle n'est JAMAIS une preuve d'autorisation : ~9 000
 *  valeurs par jour, donc énumérable.
 *
 *  Toute lecture publique exige TROIS conditions vérifiées côté serveur, dans
 *  une seule requête indexée :
 *    1. l'identifiant (référence OU id) ;
 *    2. le jeton d'accès secret `bookings.manageToken` (192 bits,
 *       crypto.randomBytes, index unique) ;
 *    3. le tenant résolu depuis la requête (jamais fourni par le navigateur).
 *
 *  Toute combinaison invalide renvoie `null` — l'appelant répond de façon
 *  GÉNÉRIQUE et identique, qu'une réservation existe ou non (aucun oracle).
 *
 *  L'administration n'utilise PAS ce module : elle s'appuie sur la session
 *  (requireCompanyMember) + companyId (lib/admin/queries.ts#getBookingDetail).
 * ============================================================================
 */

import { randomBytes } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings } from "@/lib/db/schema"
import { getBookingItemsWithOptions } from "./queries"

const ACCESS_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/
const REFERENCE_RE = /^[A-Z0-9-]{4,40}$/

/** 24 octets cryptographiquement aléatoires (192 bits), encodés base64url. */
export function generateBookingAccessToken(): string {
  return randomBytes(24).toString("base64url")
}

export function isWellFormedAccessToken(value: unknown): value is string {
  return typeof value === "string" && ACCESS_TOKEN_RE.test(value)
}

export function isWellFormedReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_RE.test(value)
}

function isPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function isValidCompanyId(value: unknown): value is number {
  return isPositiveId(value)
}

/** Réservation complète par référence + jeton, strictement bornée au tenant. */
export async function getBookingByReferenceForPublicAccess(input: {
  reference: unknown
  token: unknown
  companyId: number
}) {
  const { reference, token, companyId } = input
  if (!isWellFormedReference(reference) || !isWellFormedAccessToken(token) || !isValidCompanyId(companyId)) {
    return null
  }
  const rows = await db
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.reference, reference), eq(bookings.manageToken, token), eq(bookings.companyId, companyId)),
    )
    .limit(1)
  const booking = rows[0]
  if (!booking) return null
  return { booking, items: await getBookingItemsWithOptions(booking.id) }
}

/** Réservation complète par id + jeton, strictement bornée au tenant. */
export async function getBookingByIdForPublicAccess(input: { bookingId: unknown; token: unknown; companyId: number }) {
  const { bookingId, token, companyId } = input
  if (!isPositiveId(bookingId) || !isWellFormedAccessToken(token) || !isValidCompanyId(companyId)) return null
  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.manageToken, token), eq(bookings.companyId, companyId)))
    .limit(1)
  const booking = rows[0]
  if (!booking) return null
  return { booking, items: await getBookingItemsWithOptions(booking.id) }
}

/** Contrôle d'accès léger (sans charger la réservation) pour les actions de paiement. */
export async function hasPublicBookingAccess(input: {
  bookingId: unknown
  token: unknown
  companyId: number
}): Promise<boolean> {
  const { bookingId, token, companyId } = input
  if (!isPositiveId(bookingId) || !isWellFormedAccessToken(token) || !isValidCompanyId(companyId)) return false
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.manageToken, token), eq(bookings.companyId, companyId)))
    .limit(1)
  return rows.length === 1
}

/**
 * Garantit qu'une réservation (ancienne, sans jeton) dispose d'un jeton d'accès,
 * pour pouvoir envoyer un NOUVEAU lien sécurisé au client. À appeler UNIQUEMENT
 * depuis un contexte authentifié admin (companyId issu de la session).
 * N'écrase jamais un jeton existant. Renvoie null si la réservation n'appartient
 * pas au tenant.
 */
export async function ensureBookingAccessToken(bookingId: number, companyId: number): Promise<string | null> {
  if (!isPositiveId(bookingId) || !isValidCompanyId(companyId)) return null
  await db
    .update(bookings)
    .set({ manageToken: generateBookingAccessToken() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.companyId, companyId), isNull(bookings.manageToken)))
  const rows = await db
    .select({ token: bookings.manageToken })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.companyId, companyId)))
    .limit(1)
  return rows[0]?.token ?? null
}

/** Chemins publics (relatifs, sans tenant) d'une réservation. */
export function publicConfirmationPath(reference: string, token: string): string {
  return `/reservation/confirmation?ref=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}`
}

export function publicPaymentPath(bookingId: number, reference: string, token: string): string {
  return `/reservation/paiement/${bookingId}?ref=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}`
}
