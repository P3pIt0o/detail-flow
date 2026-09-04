import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { GRANT_TTL_MS } from "./config"

/**
 * Jeton d'autorisation d'ENVOI de photos pour UNE demande de devis.
 *
 * Le formulaire public ne reçoit JAMAIS un jeton Blob libre. À la place, une
 * fois la demande enregistrée (et ses champs validés), le serveur émet ce
 * jeton signé (HMAC-SHA256) à durée de vie courte, lié à :
 *   - une seule entreprise (companyId)
 *   - une seule demande (requestId)
 *   - un nombre maximal de photos (maxPhotos)
 *
 * Le navigateur renvoie ce jeton (a) à la route de génération de token Blob et
 * (b) à l'action d'association. Le serveur le vérifie à chaque fois et n'a
 * jamais à faire confiance au companyId / requestId transmis directement.
 */

export interface QuotePhotoGrant {
  companyId: number
  requestId: number
  maxPhotos: number
  /** Expiration (epoch ms). */
  exp: number
}

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET
  if (!s) throw new Error("BETTER_AUTH_SECRET manquant : impossible de signer le jeton d'envoi.")
  // Sel dédié : même si le secret est partagé, cette signature n'est valable
  // que pour cet usage précis.
  return `quote-photo-grant:${s}`
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url")
}

/** Émet un jeton signé compact "payload.signature". */
export function createGrant(input: Omit<QuotePhotoGrant, "exp"> & { ttlMs?: number }): string {
  const grant: QuotePhotoGrant = {
    companyId: input.companyId,
    requestId: input.requestId,
    maxPhotos: input.maxPhotos,
    exp: Date.now() + (input.ttlMs ?? GRANT_TTL_MS),
  }
  const payload = b64url(JSON.stringify(grant))
  return `${payload}.${sign(payload)}`
}

/**
 * Vérifie la signature et l'expiration. Renvoie le grant décodé, ou null si le
 * jeton est absent, malformé, falsifié ou expiré. Ne lève jamais.
 */
export function verifyGrant(token: string | null | undefined): QuotePhotoGrant | null {
  if (!token || typeof token !== "string") return null
  const dot = token.indexOf(".")
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!payload || !signature) return null

  let expected: string
  try {
    expected = sign(payload)
  } catch {
    return null
  }

  // Comparaison à temps constant.
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let grant: QuotePhotoGrant
  try {
    grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as QuotePhotoGrant
  } catch {
    return null
  }

  if (
    typeof grant.companyId !== "number" ||
    typeof grant.requestId !== "number" ||
    typeof grant.maxPhotos !== "number" ||
    typeof grant.exp !== "number"
  ) {
    return null
  }
  if (Date.now() > grant.exp) return null
  return grant
}

/** Préfixe de Blob AUTORISÉ pour une demande (aucune donnée personnelle). */
export function blobPrefix(companyId: number, requestId: number): string {
  return `quote-requests/${companyId}/${requestId}/`
}

/**
 * Construit un pathname de Blob unique et immuable pour cette demande.
 * Aucune donnée personnelle : companyId / requestId / uuid / extension.
 */
export function buildBlobPathname(
  companyId: number,
  requestId: number,
  uuid: string,
  ext: string,
): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin"
  return `${blobPrefix(companyId, requestId)}${uuid}.${safeExt}`
}
