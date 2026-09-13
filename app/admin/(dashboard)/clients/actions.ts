"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { clients } from "@/lib/db/schema"
import { requireCompanyId } from "@/lib/tenant"
import { canCreateWithinLimit, LIMIT_REACHED_MESSAGE } from "@/lib/licensing/enforce"
import { getCountryProfile } from "@/lib/billing/country-profiles"
import { normalizeEmail, normalizePhone } from "@/lib/admin/client-crm"

/** Normalise + valide l'identité B2C/B2B d'un client selon SON pays. */
function normalizeCustomerIdentity(fd: FormData):
  | { ok: true; data: { customerType: string | null; country: string | null; legalRegistrationNumber: string | null; legalRegistrationScheme: string | null; vatNumber: string | null } }
  | { ok: false; message: string } {
  const rawType = String(fd.get("customerType") ?? "").trim()
  // "" => legacy / à confirmer (NULL en base). Jamais déduit "individual".
  const customerType = rawType === "individual" || rawType === "business" ? rawType : null
  const rawCountry = String(fd.get("country") ?? "").trim().toUpperCase()
  const country = rawCountry && rawCountry !== "OTHER" ? rawCountry : rawCountry === "OTHER" ? "OTHER" : null

  if (customerType !== "business") {
    // Particulier ou à confirmer : aucun identifiant société requis.
    // On CONSERVE les valeurs déjà saisies (pas de destruction) si présentes.
    const legal = String(fd.get("legalRegistrationNumber") ?? "").trim() || null
    const vat = String(fd.get("vatNumber") ?? "").trim() || null
    return {
      ok: true,
      data: {
        customerType,
        country,
        legalRegistrationNumber: legal,
        legalRegistrationScheme: legal ? (fd.get("legalRegistrationScheme") ? String(fd.get("legalRegistrationScheme")) : null) : null,
        vatNumber: vat,
      },
    }
  }

  // Un client ENTREPRISE exige un pays explicite : jamais de FR implicite.
  if (!country) {
    return { ok: false, message: "Choisissez le pays de l'entreprise cliente." }
  }
  const profile = getCountryProfile(country)
  const legal = profile.validateLegalId(String(fd.get("legalRegistrationNumber") ?? ""))
  if (!legal.valid) return { ok: false, message: `${profile.customerLegalIdLabel} : ${legal.message ?? "format invalide."}` }
  const vat = profile.validateVatNumber(String(fd.get("vatNumber") ?? ""))
  if (!vat.valid) return { ok: false, message: `${profile.vatNumberLabel} : ${vat.message ?? "format invalide."}` }
  const legalNumber = legal.normalized || null
  return {
    ok: true,
    data: {
      customerType: "business",
      country,
      legalRegistrationNumber: legalNumber,
      legalRegistrationScheme: legalNumber ? (legal.scheme ?? profile.legalIdScheme) : null,
      vatNumber: vat.normalized || null,
    },
  }
}

export type CreateClientResult = {
  success: boolean
  message: string
}

/**
 * Recherche un doublon dans les fiches DÉJÀ scopées au tenant courant : priorité
 * à l'email normalisé, repli sur le téléphone normalisé. `excludeId` permet
 * d'ignorer la fiche en cours de modification. Réutilise les normalisations
 * partagées du module CRM (source unique de vérité création/édition/affichage).
 */
function findDuplicateClient(
  existing: { id: number; email: string | null; phone: string | null }[],
  candidate: { email: string; phone: string },
  excludeId?: number,
): boolean {
  const email = normalizeEmail(candidate.email)
  const phone = normalizePhone(candidate.phone)
  if (!email && !phone) return false
  return existing.some((c) => {
    if (excludeId != null && c.id === excludeId) return false
    if (email && normalizeEmail(c.email) === email) return true
    if (phone && normalizePhone(c.phone) === phone) return true
    return false
  })
}

export async function createClientAction(
  formData: FormData,
): Promise<CreateClientResult> {
  const companyId = await requireCompanyId()

  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const phone = String(formData.get("phone") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const notes = String(formData.get("notes") ?? "").trim()

  if (name.length < 2) {
    return {
      success: false,
      message: "Le nom du client est obligatoire.",
    }
  }

  if (!email && !phone) {
    return {
      success: false,
      message: "Renseignez au moins un email ou un numéro de téléphone.",
    }
  }

  if (email && !email.includes("@")) {
    return {
      success: false,
      message: "L’adresse email n’est pas valide.",
    }
  }

  // Anti-doublon dans l'entreprise : priorité à l'email, sinon le téléphone.
  // Mêmes normalisations que l'affichage/rapprochement (source unique CRM).
  const existing = await db
    .select({ id: clients.id, email: clients.email, phone: clients.phone })
    .from(clients)
    .where(eq(clients.companyId, companyId))

  if (findDuplicateClient(existing, { email, phone })) {
    return {
      success: false,
      message: "Un client avec cet email ou ce téléphone existe déjà.",
    }
  }

  // Limite de licence (maxCustomers) — bloque UNIQUEMENT une nouvelle création.
  // `existing` = tous les clients de l'entreprise courante (scope companyId
  // serveur), réutilisé comme comptage. LEGACY => limite null => autorisé.
  const allowed = await canCreateWithinLimit(companyId, "maxCustomers", existing.length)
  if (!allowed) {
    return { success: false, message: LIMIT_REACHED_MESSAGE }
  }

  // Nouveau client : le type doit être choisi explicitement (Particulier /
  // Entreprise). Jamais de B2C implicite pour une CRÉATION admin.
  const rawType = String(formData.get("customerType") ?? "").trim()
  if (rawType !== "individual" && rawType !== "business") {
    return { success: false, message: "Choisissez le type de client (Particulier ou Entreprise)." }
  }
  const identity = normalizeCustomerIdentity(formData)
  if (!identity.ok) return { success: false, message: identity.message }

  await db.insert(clients).values({
    companyId,
    name,
    email: email || null,
    phone: phone || null,
    address: address || null,
    notes: notes || null,
    ...identity.data,
    updatedAt: new Date(),
  })

  revalidatePath("/admin/clients")

  return {
    success: true,
    message: "Client ajouté avec succès.",
  }
}

/**
 * Modification d'un client EXISTANT. La limite maxCustomers ne s'applique PAS
 * (uniquement à la création). Anti-IDOR : le clientId est une ressource ; le
 * companyId provient EXCLUSIVEMENT de requireCompanyId (jamais du navigateur),
 * et l'UPDATE est scopé (clients.id + clients.companyId).
 * Aucune donnée n'est supprimée lors d'un changement de type (masquage UI seul).
 */
export async function updateClientAction(clientId: number, formData: FormData): Promise<CreateClientResult> {
  const companyId = await requireCompanyId()
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { success: false, message: "Client invalide." }
  }

  // Vérifie l'appartenance au tenant AVANT toute écriture (anti-IDOR).
  const [owned] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.companyId, companyId)))
    .limit(1)
  if (!owned) return { success: false, message: "Client introuvable." }

  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const phone = String(formData.get("phone") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const notes = String(formData.get("notes") ?? "").trim()

  if (name.length < 2) return { success: false, message: "Le nom du client est obligatoire." }
  if (!email && !phone) return { success: false, message: "Renseignez au moins un email ou un numéro de téléphone." }
  if (email && !email.includes("@")) return { success: false, message: "L’adresse email n’est pas valide." }

  // Contrôle d'intégrité (LOT clients v1) : anti-doublon SCOPÉ au tenant courant,
  // en excluant la fiche en cours de modification. Mêmes normalisations que la
  // création. NB : sans contrainte unique en base, une création concurrente
  // reste théoriquement possible (voir rapport) — ce contrôle couvre l'édition.
  const others = await db
    .select({ id: clients.id, email: clients.email, phone: clients.phone })
    .from(clients)
    .where(eq(clients.companyId, companyId))
  if (findDuplicateClient(others, { email, phone }, clientId)) {
    return { success: false, message: "Un autre client avec cet email ou ce téléphone existe déjà." }
  }

  const identity = normalizeCustomerIdentity(formData)
  if (!identity.ok) return { success: false, message: identity.message }

  await db
    .update(clients)
    .set({
      name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      ...identity.data,
      updatedAt: new Date(),
    })
    .where(and(eq(clients.id, clientId), eq(clients.companyId, companyId)))

  revalidatePath("/admin/clients")
  return { success: true, message: "Client mis à jour." }
}
