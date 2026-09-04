"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { customRequests, quoteRequestAttachments } from "@/lib/db/schema"
import { requireTenant, tenantAcceptsBookings } from "@/lib/tenant"
import { getPublicCustomRequestsConfig } from "@/lib/site-content"
import { findRequestType } from "@/lib/custom-requests"
import { sendCustomRequestNewLead } from "@/lib/email/custom-requests"
import { MAX_PHOTOS } from "@/lib/quote-photos/config"
import { blobPrefix, createGrant, verifyGrant } from "@/lib/quote-photos/grant"
import { associateAttachment } from "@/lib/quote-photos/server"

export type DemandeFormState = {
  status: "idle" | "success" | "error"
  message: string
  errors?: Record<string, string>
  /** Identifiant de la demande enregistrée (permet l'envoi des photos ensuite). */
  requestId?: number
  /** Jeton signé d'autorisation d'envoi des photos (court, lié à la demande). */
  grant?: string
  /** Préfixe de Blob autorisé (sans donnée personnelle). */
  uploadPrefix?: string
  /** Nombre de photos que le navigateur a annoncé vouloir envoyer. */
  photosExpected?: number
}

/** Génère un jeton d'accès client non devinable. */
function makeToken(): string {
  return randomBytes(24).toString("base64url")
}

function str(v: FormDataEntryValue | null, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

/**
 * Soumission publique d'une demande personnalisée.
 *
 * Sécurité multi-tenant : l'entreprise est résolue via `requireTenant()`
 * (hôte / ?tenant=), jamais depuis le formulaire. La demande est écrite
 * exclusivement sur `companyId` du tenant courant. La fonctionnalité doit être
 * activée côté entreprise, sinon on refuse (404 logique).
 */
export async function submitCustomRequest(
  _prev: DemandeFormState,
  formData: FormData,
): Promise<DemandeFormState> {
  // Honeypot anti-spam.
  if (str(formData.get("company_website"), 100)) {
    return { status: "success", message: "Merci, votre demande a bien été envoyée." }
  }

  const tenant = await requireTenant()
  if (!tenantAcceptsBookings(tenant)) {
    return { status: "error", message: "Cette entreprise n'accepte pas de nouvelles demandes pour le moment." }
  }

  const config = await getPublicCustomRequestsConfig()
  if (!config.enabled) {
    return { status: "error", message: "Les demandes personnalisées ne sont pas disponibles." }
  }

  const typeKey = str(formData.get("typeKey"), 60)
  const type = findRequestType(config, typeKey)
  if (!type) {
    return { status: "error", message: "Veuillez sélectionner un type de demande valide.", errors: { typeKey: "Type invalide." } }
  }

  const customerName = str(formData.get("customerName"), 120)
  const customerEmail = str(formData.get("customerEmail"), 160)
  const customerPhone = str(formData.get("customerPhone"), 40)
  const description = str(formData.get("description"), 4000)
  // Type de client (facultatif) : présent uniquement quand le formulaire active
  // le choix Particulier/Professionnel (site Spirit). Absent = comportement
  // standard historique inchangé.
  const customerType = str(formData.get("customerType"), 20)
  // Numéro d'entreprise / identifiant légal : information libre du prospect.
  // On normalise côté serveur (espaces, points, tirets, parenthèses, slashs)
  // sans interpréter le pays ni le type d'entreprise. Limite de longueur raisonnable.
  const customerLegalRegistrationNumber = str(formData.get("customerLegalRegistrationNumber"), 80)
    .replace(/[\s.\-()/]/g, "")
    .slice(0, 60)

  const errors: Record<string, string> = {}
  if (!customerName) errors.customerName = "Votre nom est requis."
  if (!/\S+@\S+\.\S+/.test(customerEmail)) errors.customerEmail = "Email invalide."
  if (!customerPhone) errors.customerPhone = "Votre téléphone est requis."
  if (description.length < 10) errors.description = "Merci de décrire votre besoin (10 caractères minimum)."
  // Identifiant légal requis UNIQUEMENT si le prospect s'est déclaré professionnel.
  if (customerType === "professionnel" && !customerLegalRegistrationNumber) {
    errors.customerLegalRegistrationNumber = "Ce numéro est requis pour un professionnel (SIREN/SIRET ou BCE)."
  }
  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Veuillez corriger les champs indiqués.", errors }
  }

  // Clé d'idempotence opaque fournie par le navigateur : un double clic, un
  // rechargement ou une nouvelle tentative réutilisent la même demande.
  const submissionId = str(formData.get("submissionId"), 64) || null
  const expectedRaw = Number.parseInt(str(formData.get("photosExpected"), 3), 10)
  const photosExpected = Number.isFinite(expectedRaw) ? Math.max(0, Math.min(MAX_PHOTOS, expectedRaw)) : 0

  // Réutilisation idempotente si la même soumission existe déjà.
  let requestId: number | null = null
  if (submissionId) {
    const [found] = await db
      .select({ id: customRequests.id })
      .from(customRequests)
      .where(and(eq(customRequests.companyId, tenant.id), eq(customRequests.submissionId, submissionId)))
      .limit(1)
    if (found) requestId = found.id
  }

  if (requestId === null) {
    const token = makeToken()
    // ON CONFLICT sur (companyId, submissionId) protège d'une course entre deux
    // envois quasi simultanés : la seconde insertion ne crée pas de doublon.
    const inserted = await db
      .insert(customRequests)
      .values({
        companyId: tenant.id,
        token,
        submissionId,
        typeKey: type.key,
        typeLabel: type.label,
        customerName,
        customerEmail,
        customerPhone,
        vehicleType: str(formData.get("vehicleType"), 60) || null,
        vehicleBrand: str(formData.get("vehicleBrand"), 60) || null,
        vehicleModel: str(formData.get("vehicleModel"), 60) || null,
        fleetCompanyName: str(formData.get("fleetCompanyName"), 120) || null,
        vehicleCount: str(formData.get("vehicleCount"), 20) || null,
        frequency: str(formData.get("frequency"), 60) || null,
        customerLegalRegistrationNumber: customerLegalRegistrationNumber || null,
        description,
        status: "new",
      })
      .onConflictDoNothing({
        target: [customRequests.companyId, customRequests.submissionId],
      })
      .returning({ id: customRequests.id })

    if (inserted[0]) {
      requestId = inserted[0].id
    } else if (submissionId) {
      // Course perdue : la demande a été créée par l'appel concurrent, on la relit.
      const [row] = await db
        .select({ id: customRequests.id })
        .from(customRequests)
        .where(and(eq(customRequests.companyId, tenant.id), eq(customRequests.submissionId, submissionId)))
        .limit(1)
      requestId = row?.id ?? null
    }
  }

  if (requestId === null) {
    return { status: "error", message: "Une erreur est survenue. Merci de réessayer." }
  }

  // Des photos sont annoncées : la demande est DÉJÀ enregistrée (jamais perdue).
  // On renvoie un jeton signé, court et lié à cette demande ; l'email partira
  // une seule fois lors de la finalisation, avec le nombre réel de photos.
  if (photosExpected > 0) {
    const grant = createGrant({ companyId: tenant.id, requestId, maxPhotos: photosExpected })
    revalidatePath("/admin/demandes")
    return {
      status: "success",
      message: "Votre demande a bien été enregistrée. Envoi des photos en cours…",
      requestId,
      grant,
      uploadPrefix: blobPrefix(tenant.id, requestId),
      photosExpected,
    }
  }

  // Aucune photo : notification immédiate (une seule fois) puis fin.
  await notifyProfessionalOnce(tenant.id, requestId)
  revalidatePath("/admin/demandes")
  return { status: "success", message: "Votre demande a bien été envoyée.", requestId }
}

/**
 * Envoie la notification « nouvelle demande » au professionnel EXACTEMENT une
 * fois par demande. La garde atomique sur `notifiedAt` (mise à jour
 * conditionnelle) empêche tout doublon même en cas d'appels concurrents ou de
 * nouvelles tentatives (finalisation rejouée).
 */
async function notifyProfessionalOnce(companyId: number, requestId: number): Promise<void> {
  // Réserve le droit d'envoyer : seule la 1re mise à jour (notifiedAt NULL) gagne.
  const claimed = await db
    .update(customRequests)
    .set({ notifiedAt: new Date() })
    .where(
      and(
        eq(customRequests.id, requestId),
        eq(customRequests.companyId, companyId),
        sql`${customRequests.notifiedAt} IS NULL`,
      ),
    )
    .returning({ id: customRequests.id })
  if (!claimed[0]) return // déjà notifié

  const [req] = await db
    .select()
    .from(customRequests)
    .where(and(eq(customRequests.id, requestId), eq(customRequests.companyId, companyId)))
    .limit(1)
  if (!req) return

  const detailLines: { label: string; value: string }[] = []
  const push = (label: string, value: string | null) => value && detailLines.push({ label, value })
  push("Type de véhicule", req.vehicleType)
  push("Marque", req.vehicleBrand)
  push("Modèle", req.vehicleModel)
  push("Société / flotte", req.fleetCompanyName)
  push("Nombre de véhicules", req.vehicleCount)
  push("Fréquence souhaitée", req.frequency)
  push("Numéro d'entreprise / identifiant légal", req.customerLegalRegistrationNumber)

  // Nombre de photos réellement associées (jamais les fichiers eux-mêmes).
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quoteRequestAttachments)
    .where(eq(quoteRequestAttachments.requestId, requestId))
  const photoCount = Number(n)
  if (photoCount > 0) {
    push("Photos jointes", `${photoCount} photo${photoCount > 1 ? "s" : ""} (voir dans l'administration)`)
  }

  try {
    await sendCustomRequestNewLead({
      companyId,
      id: requestId,
      typeLabel: req.typeLabel,
      customerName: req.customerName,
      customerEmail: req.customerEmail,
      customerPhone: req.customerPhone,
      description: req.description,
      detailLines,
    })
  } catch (e) {
    // L'email est non bloquant : la demande reste enregistrée.
    console.log("[v0] demande: échec notification", e instanceof Error ? e.message : e)
  }
}

/** Résultat d'association d'une photo (renvoyé au navigateur). */
export type AssociatePhotoState =
  | { ok: true; alreadyAssociated: boolean }
  | { ok: false; error: string; code: string }

/**
 * Associe UNE photo déjà téléversée dans le Blob privé à sa demande. Le jeton
 * signé (grant) porte l'entreprise + la demande : le navigateur ne transmet
 * jamais un companyId / requestId de confiance. Idempotent.
 */
export async function associateQuotePhoto(input: {
  grant: string
  pathname: string
  originalName: string
  sortOrder: number
  width?: number | null
  height?: number | null
}): Promise<AssociatePhotoState> {
  const grant = verifyGrant(input.grant)
  if (!grant) return { ok: false, error: "Autorisation expirée. Merci de renvoyer la photo.", code: "grant" }

  const res = await associateAttachment({
    grant,
    pathname: input.pathname,
    originalName: input.originalName,
    sortOrder: Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
    width: input.width ?? null,
    height: input.height ?? null,
  })
  if (res.ok) {
    revalidatePath("/admin/demandes")
    return { ok: true, alreadyAssociated: res.alreadyAssociated }
  }
  return { ok: false, error: res.error, code: res.code }
}

/**
 * Finalise la demande : envoie la notification unique au professionnel. Appelée
 * par le navigateur une fois les envois de photos terminés (succès total ou
 * partiel). Idempotente grâce à la garde `notifiedAt`.
 */
export async function finalizeCustomRequest(input: { grant: string }): Promise<{ ok: boolean }> {
  const grant = verifyGrant(input.grant)
  if (!grant) return { ok: false }
  await notifyProfessionalOnce(grant.companyId, grant.requestId)
  revalidatePath("/admin/demandes")
  return { ok: true }
}
