"use server"

import { requireCompanyMember } from "@/lib/admin"
import { sendCustomWebsiteRequest, interpretSendResult } from "@/lib/email/custom-website"

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

  // Point 7 : la confirmation n'est renvoyée QUE si Resend a réellement accepté
  // l'envoi (`res.ok`). Un `skipped` (aucun destinataire / infra non configurée)
  // ou une erreur provider donne un échec contrôlé — jamais de fausse
  // confirmation. On journalise le détail côté serveur (sans secret) ; l'erreur
  // renvoyée au client reste générique.
  const outcome = interpretSendResult(res)
  if (!outcome.ok) {
    console.log(
      "[v0] Échec envoi demande site personnalisé:",
      JSON.stringify({ tenant: tenant.slug, skipped: res.skipped ?? false, error: res.error ?? null }),
    )
    return { error: outcome.error }
  }
  return { ok: true }
}
