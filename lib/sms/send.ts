import "server-only"

import { randomBytes } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { smsCredits } from "@/lib/db/schema"
import { canUseFeature } from "@/lib/licensing/enforce"

/**
 * Provider SMS unique de DetailFlow : AllMySMS.
 *
 * Variables serveur :
 * - ALLMYSMS_LOGIN
 * - ALLMYSMS_API_KEY
 * - ALLMYSMS_SENDER (optionnel)
 * - ALLMYSMS_SUBACCOUNT_EMAIL (optionnel, fallback sms@detailflow.fr)
 */

const ALLMYSMS_ENDPOINT = "https://api.allmysms.com/http/9.0/sendSms/"
const ALLMYSMS_SUBACCOUNT_ENDPOINT =
  "https://api.allmysms.com/http/9.0/createSubAccount/"
const ALLMYSMS_MANAGE_CREDITS_ENDPOINT =
  "https://api.allmysms.com/http/9.0/manageSubAccountCredits/"

export type SendSmsResult = {
  ok: boolean
  id?: string
  error?: string
  skipped?: boolean
}

type SendSmsArgs = {
  to: string
  message: string
  companyId?: number
}

/**
 * Normalise un numéro français au format international sans "+".
 *
 * Exemples :
 * 0612345678 -> 33612345678
 * +33612345678 -> 33612345678
 * 0033612345678 -> 33612345678
 */
export function normalizeFrenchMobile(raw: string): string | null {
  let digits = (raw || "").replace(/[^\d+]/g, "")

  if (digits.startsWith("+")) {
    digits = digits.slice(1)
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2)
  }

  if (digits.startsWith("0") && digits.length === 10) {
    digits = "33" + digits.slice(1)
  }

  if (!/^\d{8,15}$/.test(digits)) {
    return null
  }

  return digits
}

function centralCredentials(): {
  login?: string
  apiKey?: string
  sender?: string
} {
  return {
    login: process.env.ALLMYSMS_LOGIN,
    apiKey: process.env.ALLMYSMS_API_KEY,
    sender: process.env.ALLMYSMS_SENDER,
  }
}

type ResolvedCredentials =
  | {
      ok: true
      login: string
      apiKey: string
      sender?: string
      source: "central" | "subaccount"
    }
  | {
      ok: false
      error: string
      skipped?: boolean
    }

/**
 * Résout les identifiants AllMySMS.
 *
 * - sans companyId : compte central
 * - tenant non provisionné : compte central
 * - tenant provisionné : sous-compte exclusivement
 */
async function resolveCredentials(
  companyId?: number,
): Promise<ResolvedCredentials> {
  const central = centralCredentials()

  const centralResolved = (): ResolvedCredentials =>
    central.login && central.apiKey
      ? {
          ok: true,
          login: central.login,
          apiKey: central.apiKey,
          sender: central.sender,
          source: "central",
        }
      : {
          ok: false,
          skipped: true,
          error: "Identifiants AllMySMS manquants",
        }

  if (!companyId) {
    return centralResolved()
  }

  let row:
    | {
        login: string | null
        apiKey: string | null
      }
    | undefined

  try {
    ;[row] = await db
      .select({
        login: smsCredits.allmysmsSubLogin,
        apiKey: smsCredits.allmysmsSubApiKey,
      })
      .from(smsCredits)
      .where(eq(smsCredits.companyId, companyId))
      .limit(1)
  } catch (error) {
    console.log(
      "[sms] resolveCredentials erreur DB:",
      error instanceof Error ? error.message : error,
    )

    return {
      ok: false,
      error: "Résolution du sous-compte AllMySMS impossible",
    }
  }

  if (row?.login) {
    if (!row.apiKey) {
      return {
        ok: false,
        error:
          "Sous-compte AllMySMS incomplet (clé manquante) — envoi via le compte central refusé",
      }
    }

    return {
      ok: true,
      login: row.login,
      apiKey: row.apiKey,
      sender: central.sender,
      source: "subaccount",
    }
  }

  return centralResolved()
}

/**
 * Création idempotente du sous-compte AllMySMS d'un tenant.
 *
 * IMPORTANT :
 * Le support AllMySMS a confirmé que les champs obligatoires sont :
 * FIRSTNAME
 * LASTNAME
 * SOCIETY
 * MOBILE
 * EMAIL
 * LOGIN
 * PASSWORD
 *
 * ACTIVE ne doit PAS être envoyé.
 */
export async function ensureTenantSubAccount(input: {
  companyId: number
  companyName: string
  firstName: string | null | undefined
  lastName: string | null | undefined
  mobile: string | null | undefined
}): Promise<{
  ok: boolean
  created: boolean
  error?: string
}> {
  const central = centralCredentials()

  if (!central.login || !central.apiKey) {
    return {
      ok: false,
      created: false,
      error: "Compte central AllMySMS non configuré",
    }
  }

  /**
   * Idempotence :
   * si le sous-compte existe déjà, on ne le recrée jamais.
   */
  const [existing] = await db
    .select({
      login: smsCredits.allmysmsSubLogin,
      apiKey: smsCredits.allmysmsSubApiKey,
    })
    .from(smsCredits)
    .where(eq(smsCredits.companyId, input.companyId))
    .limit(1)

  if (existing?.login && existing?.apiKey) {
    return {
      ok: true,
      created: false,
    }
  }

  const companyName = (input.companyName || "").trim()
  const firstName = (input.firstName || "").trim()
  const lastName = (input.lastName || "").trim()

  if (!companyName) {
    return {
      ok: false,
      created: false,
      error: "Nom de l’entreprise manquant.",
    }
  }

  if (!firstName) {
    return {
      ok: false,
      created: false,
      error: "Prénom du propriétaire manquant.",
    }
  }

  if (!lastName) {
    return {
      ok: false,
      created: false,
      error: "Nom du propriétaire manquant.",
    }
  }

  /**
   * MOBILE est obligatoire chez AllMySMS.
   */
  const normalizedMobile = normalizeFrenchMobile(input.mobile ?? "")

  if (!normalizedMobile) {
    return {
      ok: false,
      created: false,
      error:
        "Numéro de téléphone professionnel manquant ou invalide. Renseignez-le avant d’activer les SMS.",
    }
  }

  /**
   * Adresse technique DetailFlow.
   *
   * AllMySMS nous a confirmé qu'une même adresse professionnelle
   * peut être utilisée pour plusieurs sous-comptes.
   */
  const technicalEmail = (
    process.env.ALLMYSMS_SUBACCOUNT_EMAIL || "sms@detailflow.fr"
  )
    .trim()
    .toLowerCase()

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(technicalEmail)

  if (!emailIsValid) {
    return {
      ok: false,
      created: false,
      error: "Adresse technique AllMySMS invalide.",
    }
  }

  /**
   * Identifiants du sous-compte.
   */
  const subLogin = `detailflow_t${input.companyId}`
  const subPassword = randomBytes(12).toString("base64url")

  /**
   * Structure officielle AllMySMS.
   *
   * ACTIVE est volontairement absent :
   * AllMySMS le positionne automatiquement à 1.
   */
  const stream = {
    DATA: {
      FIRSTNAME: firstName,
      LASTNAME: lastName,
      SOCIETY: companyName,
      MOBILE: `+${normalizedMobile}`,
      EMAIL: technicalEmail,
      LOGIN: subLogin,
      PASSWORD: subPassword,
    },
  }

  /**
   * AllMySMS attend :
   *
   * application/x-www-form-urlencoded
   *
   * accountData = chaîne JSON contenant DATA.
   */
  const body = new URLSearchParams()

  body.set("login", central.login)
  body.set("apiKey", central.apiKey)
  body.set("accountData", JSON.stringify(stream))

  try {
    const response = await fetch(ALLMYSMS_SUBACCOUNT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    })

    const text = await response.text()

    let json: {
      status?: number | string
      statusText?: string
      apiKey?: string
      login?: string
    } | null = null

    try {
      json = JSON.parse(text)
    } catch {
      console.log(
        "[sms] createSubAccount réponse illisible (HTTP",
        response.status,
        ")",
      )

      return {
        ok: false,
        created: false,
        error: "Réponse AllMySMS invalide",
      }
    }

    /**
     * AllMySMS createSubAccount :
     * succès = status 1.
     */
    const success = json?.status === "1" || json?.status === 1

    const subApiKey = json?.apiKey

    if (success && subApiKey) {
      await db
        .update(smsCredits)
        .set({
          allmysmsSubLogin: subLogin,
          allmysmsSubApiKey: subApiKey,
          updatedAt: new Date(),
        })
        .where(eq(smsCredits.companyId, input.companyId))

      return {
        ok: true,
        created: true,
      }
    }

    console.log(
      "[sms] createSubAccount échec status:",
      json?.status,
      json?.statusText,
    )

    return {
      ok: false,
      created: false,
      error:
        json?.statusText ||
        `Statut AllMySMS ${json?.status ?? "inconnu"}`,
    }
  } catch (error) {
    console.log(
      "[sms] createSubAccount erreur réseau:",
      error instanceof Error ? error.message : "inconnue",
    )

    return {
      ok: false,
      created: false,
      error: "Erreur réseau AllMySMS",
    }
  }
}

export type AllocateResult = {
  ok: boolean
  allocated: number
  error?: string
}

/**
 * Transfert réel de crédits du compte central vers un sous-compte.
 */
export async function allocateCreditsToTenant(
  companyId: number,
  quantity: number,
): Promise<AllocateResult> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return {
      ok: false,
      allocated: 0,
      error: "Quantité invalide (doit être un entier > 0)",
    }
  }

  const central = centralCredentials()

  if (!central.login || !central.apiKey) {
    return {
      ok: false,
      allocated: 0,
      error: "Compte central AllMySMS non configuré",
    }
  }

  const [row] = await db
    .select({
      subLogin: smsCredits.allmysmsSubLogin,
      subApiKey: smsCredits.allmysmsSubApiKey,
    })
    .from(smsCredits)
    .where(eq(smsCredits.companyId, companyId))
    .limit(1)

  if (!row?.subLogin || !row?.subApiKey) {
    return {
      ok: false,
      allocated: 0,
      error: "Aucun sous-compte AllMySMS pour ce tenant",
    }
  }

  const body = new URLSearchParams()

  body.set("login", central.login)
  body.set("apiKey", central.apiKey)
  body.set("subaccount", row.subLogin)
  body.set("credits", String(quantity))
  body.set("returnformat", "JSON")

  try {
    const response = await fetch(ALLMYSMS_MANAGE_CREDITS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    })

    const text = await response.text()

    let json: {
      status?: string | number
      statusText?: string
    } | null = null

    try {
      json = JSON.parse(text)
    } catch {
      console.log(
        "[sms] manageSubAccountCredits réponse illisible (HTTP",
        response.status,
        ")",
      )

      return {
        ok: false,
        allocated: 0,
        error: "Réponse AllMySMS invalide",
      }
    }

    const ok =
      json?.status === "OK" ||
      json?.status === 100 ||
      json?.status === "100"

    if (!ok) {
      console.log(
        "[sms] manageSubAccountCredits échec status:",
        json?.status,
        json?.statusText,
      )

      return {
        ok: false,
        allocated: 0,
        error:
          json?.statusText ||
          `Statut AllMySMS ${json?.status ?? "inconnu"}`,
      }
    }

    await db
      .update(smsCredits)
      .set({
        allmysmsCreditsAllocated: sql`
          ${smsCredits.allmysmsCreditsAllocated} + ${quantity}
        `,
        allmysmsLastAllocationAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(smsCredits.companyId, companyId))

    return {
      ok: true,
      allocated: quantity,
    }
  } catch (error) {
    console.log(
      "[sms] manageSubAccountCredits erreur réseau:",
      error instanceof Error ? error.message : "inconnue",
    )

    return {
      ok: false,
      allocated: 0,
      error: "Erreur réseau AllMySMS",
    }
  }
}

export type AllocateDeltaResult = {
  ok: boolean
  allocated: number
  delta: number
  totalGranted: number
  alreadyAllocated: number
  error?: string
}

/**
 * Transfère uniquement les crédits jamais encore alloués.
 *
 * IMPORTANT :
 * calcul basé sur granted + purchased.
 *
 * JAMAIS sur balance.
 */
export async function allocateDeltaToTenant(
  companyId: number,
): Promise<AllocateDeltaResult> {
  const [row] = await db
    .select({
      granted: smsCredits.granted,
      purchased: smsCredits.purchased,
      allocated: smsCredits.allmysmsCreditsAllocated,
    })
    .from(smsCredits)
    .where(eq(smsCredits.companyId, companyId))
    .limit(1)

  const totalGranted =
    (row?.granted ?? 0) +
    (row?.purchased ?? 0)

  const alreadyAllocated =
    row?.allocated ?? 0

  const delta =
    totalGranted - alreadyAllocated

  if (delta <= 0) {
    return {
      ok: true,
      allocated: 0,
      delta: 0,
      totalGranted,
      alreadyAllocated,
    }
  }

  const result =
    await allocateCreditsToTenant(
      companyId,
      delta,
    )

  return {
    ok: result.ok,
    allocated: result.allocated,
    delta,
    totalGranted,
    alreadyAllocated,
    error: result.error,
  }
}

/**
 * Envoi SMS AllMySMS.
 */
export async function sendSms(
  args: SendSmsArgs,
): Promise<SendSmsResult> {
  if (!args.to || !args.message) {
    return {
      ok: false,
      error: "Numéro ou message manquant.",
    }
  }

  /**
   * Défense en profondeur (feature sms).
   *
   * Uniquement quand un companyId est fourni : aucun chemin serveur tenant ne
   * peut envoyer un SMS si la licence explicite n'inclut pas `sms`. LEGACY
   * (licensePlan = NULL) => autorisé.
   *
   * IMPORTANT : sans companyId (route centrale /api/admin/sms-test du
   * super-admin), ce contrôle est ignoré — la configuration centrale reste
   * testable et n'est jamais bloquée par une licence tenant.
   */
  if (args.companyId != null && !(await canUseFeature(args.companyId, "sms"))) {
    return {
      ok: false,
      skipped: true,
      error: "SMS non inclus dans la licence.",
    }
  }

  const credentials =
    await resolveCredentials(
      args.companyId,
    )

  if (!credentials.ok) {
    console.log(
      "[sms] SMS non envoyé —",
      credentials.error,
    )

    return {
      ok: false,
      skipped: credentials.skipped,
      error: credentials.error,
    }
  }

  const {
    login,
    apiKey,
    sender,
  } = credentials

  const phone =
    normalizeFrenchMobile(args.to)

  if (!phone) {
    return {
      ok: false,
      error: "Numéro de téléphone invalide.",
    }
  }

  const smsData = {
    DATA: {
      MESSAGE: args.message,

      ...(sender
        ? {
            TPOA: sender,
          }
        : {}),

      SMS: [
        {
          MOBILEPHONE: phone,
        },
      ],
    },
  }

  const body =
    new URLSearchParams()

  body.set(
    "login",
    login,
  )

  body.set(
    "apiKey",
    apiKey,
  )

  body.set(
    "smsData",
    JSON.stringify(smsData),
  )

  try {
    const response =
      await fetch(
        ALLMYSMS_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body: body.toString(),
          cache: "no-store",
        },
      )

    const text =
      await response.text()

    let json: {
      status?: number
      statusText?: string
      smsIds?: {
        phoneNumber: string
        smsId: string
      }[]
    } | null = null

    try {
      json =
        JSON.parse(text)
    } catch {
      console.log(
        "[sms] Réponse AllMySMS illisible (HTTP",
        response.status,
        ")",
      )

      return {
        ok: false,
        error:
          "Réponse AllMySMS invalide",
      }
    }

    /**
     * sendSms :
     * succès = status 100.
     */
    if (
      json &&
      json.status === 100
    ) {
      const id =
        json.smsIds?.[0]?.smsId

      return {
        ok: true,
        id,
      }
    }

    console.log(
      "[sms] Échec AllMySMS status:",
      json?.status,
      json?.statusText,
    )

    return {
      ok: false,
      error:
        json?.statusText ||
        `Statut AllMySMS ${
          json?.status ?? "inconnu"
        }`,
    }
  } catch (error) {
    console.log(
      "[sms] Erreur réseau AllMySMS:",
      error instanceof Error
        ? error.message
        : "inconnue",
    )

    return {
      ok: false,
      error:
        "Erreur réseau AllMySMS",
    }
  }
}
