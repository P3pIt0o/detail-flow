import "server-only"

import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { smsCredits } from "@/lib/db/schema"

/**
 * Abstraction UNIQUE d'envoi de SMS — fournisseur : AllMySMS (compte central).
 *
 * Un seul point d'entrée `sendSms({ to, message })`. Toute la logique métier
 * (crédits, débit, rappels, anti-doublon) reste en dehors de ce fichier et ne
 * dépend que du résultat structuré renvoyé ici.
 *
 * Variables d'environnement (SERVEUR UNIQUEMENT — jamais exposées au client) :
 *   - ALLMYSMS_LOGIN    : identifiant client allmysms.com            (requis)
 *   - ALLMYSMS_API_KEY  : clé d'API allmysms.com                     (requis)
 *   - ALLMYSMS_SENDER   : nom d'expéditeur (TPOA) déjà validé        (optionnel)
 *
 * Sous-comptes : AllMySMS permet un compte central pilotant des sous-comptes
 * (un par tenant, avec sender dédié). Cette étape utilise UNIQUEMENT le compte
 * central. Le point d'extension `resolveCredentials()` ci-dessous isole la
 * résolution des identifiants pour pouvoir, plus tard, retourner les
 * identifiants/sender d'un sous-compte par tenant SANS toucher au reste.
 */

const ALLMYSMS_ENDPOINT = "https://api.allmysms.com/http/9.0/sendSms/"
const ALLMYSMS_SUBACCOUNT_ENDPOINT = "https://api.allmysms.com/http/9.0/createSubAccount/"

export type SendSmsResult = { ok: boolean; id?: string; error?: string; skipped?: boolean }

type SendSmsArgs = {
  /** Numéro du destinataire (accepte +33…, 0033…, 06/07…). */
  to: string
  /** Corps du message (texte brut). */
  message: string
  /**
   * Réservé à une future gestion par sous-compte AllMySMS (un sous-compte /
   * sender par tenant). Non utilisé tant que le compte central est seul actif.
   */
  companyId?: number
}

/**
 * Normalise un numéro FR au format AllMySMS : international SANS « + »
 * (ex. `0612345678` → `33612345678`). Renvoie null si le numéro est invalide.
 */
export function normalizeFrenchMobile(raw: string): string | null {
  let digits = (raw || "").replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) digits = digits.slice(1)
  if (digits.startsWith("00")) digits = digits.slice(2)
  // Numéro national FR (0X........) -> 33X........
  if (digits.startsWith("0") && digits.length === 10) digits = "33" + digits.slice(1)
  if (!/^\d{8,15}$/.test(digits)) return null
  return digits
}

/** Identifiants AllMySMS du COMPTE CENTRAL (variables serveur). */
function centralCredentials(): { login?: string; apiKey?: string; sender?: string } {
  return {
    login: process.env.ALLMYSMS_LOGIN,
    apiKey: process.env.ALLMYSMS_API_KEY,
    sender: process.env.ALLMYSMS_SENDER, // optionnel : sender validé côté AllMySMS
  }
}

/**
 * Résout les identifiants AllMySMS à utiliser pour un tenant donné :
 *  - si le tenant possède un SOUS-COMPTE (login + apiKey en base) → on l'utilise ;
 *  - sinon → repli sur le COMPTE CENTRAL.
 * Résolution 100% serveur à partir d'un `companyId` de confiance (jamais issu
 * du navigateur). Les secrets ne quittent jamais le serveur.
 */
async function resolveCredentials(
  companyId?: number,
): Promise<{ login?: string; apiKey?: string; sender?: string }> {
  const central = centralCredentials()
  if (!companyId) return central
  try {
    const [row] = await db
      .select({ login: smsCredits.allmysmsSubLogin, apiKey: smsCredits.allmysmsSubApiKey })
      .from(smsCredits)
      .where(eq(smsCredits.companyId, companyId))
      .limit(1)
    if (row?.login && row?.apiKey) {
      // Sender : on garde le sender central tant qu'aucun sender dédié par
      // sous-compte n'est géré (étape ultérieure).
      return { login: row.login, apiKey: row.apiKey, sender: central.sender }
    }
  } catch (e) {
    console.log("[v0] resolveCredentials fallback central:", e instanceof Error ? e.message : e)
  }
  return central
}

/**
 * Provisionne, de façon IDEMPOTENTE, le sous-compte AllMySMS d'un tenant.
 * Appelé à la PREMIÈRE activation des rappels SMS d'une entreprise.
 *
 *  - si un sous-compte est déjà enregistré (login + apiKey) → ne fait RIEN
 *    (jamais deux créations) ;
 *  - sinon appelle `createSubAccount` sur le compte central puis enregistre
 *    login/apiKey du sous-compte sur la ligne `sms_credits` du tenant.
 *
 * Ne lève jamais : en cas d'échec, on reste sur le compte central (fallback) et
 * l'activation SMS n'est pas bloquée. `companyId` doit être résolu serveur.
 * NOTE : ne transfère AUCUN crédit AllMySMS vers le sous-compte (voir rapport).
 */
export async function ensureTenantSubAccount(input: {
  companyId: number
  companyName: string
  email: string
}): Promise<{ ok: boolean; created: boolean; error?: string }> {
  const central = centralCredentials()
  if (!central.login || !central.apiKey) {
    return { ok: false, created: false, error: "Compte central AllMySMS non configuré" }
  }

  // Garde d'idempotence : ne crée pas si un sous-compte existe déjà.
  const [existing] = await db
    .select({ login: smsCredits.allmysmsSubLogin, apiKey: smsCredits.allmysmsSubApiKey })
    .from(smsCredits)
    .where(eq(smsCredits.companyId, input.companyId))
    .limit(1)
  if (existing?.login && existing?.apiKey) {
    return { ok: true, created: false }
  }

  // Identifiants déterministes/uniques pour le sous-compte du tenant.
  const subLogin = `detailflow_t${input.companyId}`
  const subPassword = randomBytes(12).toString("base64url") // >= 6 caractères
  const [firstName, ...rest] = (input.companyName || `Tenant ${input.companyId}`).trim().split(/\s+/)
  const accountData = {
    FIRSTNAME: firstName || "DetailFlow",
    LASTNAME: rest.join(" ") || `Tenant ${input.companyId}`,
    EMAIL: input.email,
    LOGIN: subLogin,
    PASSWORD: subPassword,
    ACTIVE: 1,
  }

  const body = new URLSearchParams()
  body.set("login", central.login)
  body.set("apiKey", central.apiKey)
  body.set("accountData", JSON.stringify(accountData))

  try {
    const res = await fetch(ALLMYSMS_SUBACCOUNT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    })
    const text = await res.text()
    let json: { status?: number; statusText?: string; apiKey?: string; login?: string } | null = null
    try {
      json = JSON.parse(text)
    } catch {
      console.log("[v0] createSubAccount réponse illisible (HTTP", res.status, ")")
      return { ok: false, created: false, error: "Réponse AllMySMS invalide" }
    }

    // Succès = status 100. AllMySMS renvoie la clé d'API du sous-compte créé.
    const subApiKey = json?.apiKey
    if (json?.status === 100 && subApiKey) {
      await db
        .update(smsCredits)
        .set({ allmysmsSubLogin: subLogin, allmysmsSubApiKey: subApiKey, updatedAt: new Date() })
        .where(eq(smsCredits.companyId, input.companyId))
      return { ok: true, created: true }
    }

    console.log("[v0] createSubAccount échec status:", json?.status, json?.statusText)
    return { ok: false, created: false, error: json?.statusText || `Statut ${json?.status ?? "?"}` }
  } catch (e) {
    console.log("[v0] createSubAccount erreur réseau:", e instanceof Error ? e.message : "inconnue")
    return { ok: false, created: false, error: "Erreur réseau AllMySMS" }
  }
}

/**
 * Envoie un SMS via AllMySMS. Ne lève jamais : renvoie un résultat structuré
 * pour que le flux métier décide de débiter (ou non) un crédit.
 *
 *  - `ok: true`  → SMS accepté par AllMySMS (status 100). `id` = smsId.
 *  - `ok: false` → non envoyé (config absente, numéro invalide, erreur API).
 *    `skipped: true` distingue une absence de configuration d'un vrai échec.
 */
export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  if (!args.to || !args.message) {
    return { ok: false, error: "Numéro ou message manquant." }
  }

  const { login, apiKey, sender } = await resolveCredentials(args.companyId)
  if (!login || !apiKey) {
    // Configuration absente : on ne bloque pas le flux métier (pas de débit).
    console.log("[v0] SMS non envoyé — identifiants AllMySMS manquants.")
    return { ok: false, skipped: true, error: "Identifiants AllMySMS manquants" }
  }

  const phone = normalizeFrenchMobile(args.to)
  if (!phone) {
    return { ok: false, error: "Numéro de téléphone invalide." }
  }

  const smsData = {
    DATA: {
      MESSAGE: args.message,
      // TPOA (sender) uniquement s'il est configuré ET validé côté AllMySMS ;
      // sinon on l'omet -> AllMySMS applique l'expéditeur par défaut du compte.
      ...(sender ? { TPOA: sender } : {}),
      SMS: [{ MOBILEPHONE: phone }],
    },
  }

  const body = new URLSearchParams()
  body.set("login", login)
  body.set("apiKey", apiKey)
  body.set("smsData", JSON.stringify(smsData))

  try {
    const res = await fetch(ALLMYSMS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    })

    const text = await res.text()
    let json: {
      status?: number
      statusText?: string
      smsIds?: { phoneNumber: string; smsId: string }[]
    } | null = null
    try {
      json = JSON.parse(text)
    } catch {
      // Réponse non-JSON : on remonte un échec générique (sans logger de secret).
      console.log("[v0] Réponse AllMySMS illisible (HTTP", res.status, ")")
      return { ok: false, error: "Réponse AllMySMS invalide" }
    }

    // Succès AllMySMS = status 100.
    if (json && json.status === 100) {
      const id = json.smsIds && json.smsIds[0]?.smsId
      return { ok: true, id }
    }

    // Échec applicatif : on remonte le statut/texte (jamais la clé d'API).
    console.log("[v0] Échec AllMySMS status:", json?.status, json?.statusText)
    return { ok: false, error: json?.statusText || `Statut AllMySMS ${json?.status ?? "?"}` }
  } catch (e) {
    console.log("[v0] Erreur réseau AllMySMS:", e instanceof Error ? e.message : "inconnue")
    return { ok: false, error: "Erreur réseau AllMySMS" }
  }
}
