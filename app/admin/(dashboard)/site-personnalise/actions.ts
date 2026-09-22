"use server"

import { requireCompanyMember } from "@/lib/admin"
import { sendCustomWebsiteRequest } from "@/lib/email/custom-website"

/* -------------------------------------------------------------------------- */
/*  Parcours « site personnalisé » — qualification d'une demande sur mesure    */
/*  transmise par email (aucune table, aucune migration). Non destructif.      */
/* -------------------------------------------------------------------------- */

export type CustomWebsiteState = { ok?: boolean; error?: string }

/** Normalise un champ texte (chaîne vide → null). */
function clean(v: FormDataEntryValue | null): string | null {
  const t = String(v ?? "").trim()
  return t ? t : null
}

/**
 * Transmet la demande de site personnalisé du professionnel connecté à l'équipe
 * DetailFlow. Scopée au tenant via `requireCompanyMember` (isolation multi-tenant
 * inchangée). Ne crée ni ne modifie aucune donnée : simple envoi d'email.
 */
export async function submitCustomWebsiteRequest(
  _prev: CustomWebsiteState,
  formData: FormData,
): Promise<CustomWebsiteState> {
  const { tenant } = await requireCompanyMember()

  const companyName = clean(formData.get("companyName")) ?? tenant.name
  const needs = clean(formData.get("needs"))
  const contactName = clean(formData.get("contactName"))
  const contactEmail = clean(formData.get("contactEmail"))

  if (!contactName) return { error: "Merci d'indiquer votre nom." }
  if (!contactEmail || !/^\S+@\S+\.\S+$/.test(contactEmail)) {
    return { error: "Merci d'indiquer un email de contact valide." }
  }
  if (!needs) return { error: "Merci de décrire vos besoins." }

  const res = await sendCustomWebsiteRequest({
    companyName,
    city: clean(formData.get("city")),
    currentSite: clean(formData.get("currentSite")),
    instagram: clean(formData.get("instagram")),
    needs,
    features: clean(formData.get("features")),
    contactName,
    contactEmail,
    contactPhone: clean(formData.get("contactPhone")),
    tenantSlug: tenant.slug,
  })

  // `ok` = email réellement envoyé. `skipped` = infrastructure non configurée
  // en aperçu (pas de destinataire) : on considère la demande enregistrée pour
  // ne pas bloquer le professionnel ; l'échec dur (provider) est signalé.
  if (res.ok || res.skipped) return { ok: true }
  return { error: "L'envoi de votre demande a échoué. Réessayez ou écrivez-nous directement." }
}
