"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { customRequests } from "@/lib/db/schema"
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

  const token = makeToken()
  const [row] = await db
    .insert(customRequests)
    .values({
      companyId: tenant.id,
      token,
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
    .returning({ id: customRequests.id })

  // Notifie le professionnel (non bloquant).
  const detailLines: { label: string; value: string }[] = []
  const push = (label: string, value: string) => value && detailLines.push({ label, value })
  push("Type de véhicule", str(formData.get("vehicleType"), 60))
  push("Marque", str(formData.get("vehicleBrand"), 60))
  push("Modèle", str(formData.get("vehicleModel"), 60))
  push("Société / flotte", str(formData.get("fleetCompanyName"), 120))
  push("Nombre de véhicules", str(formData.get("vehicleCount"), 20))
  push("Fréquence souhaitée", str(formData.get("frequency"), 60))
  push("Numéro d'entreprise / identifiant légal", customerLegalRegistrationNumber)

  await sendCustomRequestNewLead({
    companyId: tenant.id,
    id: row.id,
    typeLabel: type.label,
    customerName,
    customerEmail,
    customerPhone,
    description,
    detailLines,
  })

  revalidatePath("/admin/demandes")
  return { status: "success", message: "Votre demande a bien été envoyée." }
}
