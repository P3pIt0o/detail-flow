import "server-only"
import { cache } from "react"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { getCurrentTenant, type Tenant } from "@/lib/tenant"

/**
 * Coordonnées publiques résolues d'un tenant.
 *
 * Source de vérité : la table `settings` (businessName / businessEmail /
 * businessPhone / businessAddress), renseignée par les onglets « Entreprise »
 * et « Déplacement » de l'administration. Repli éventuel sur les colonnes de
 * `companies`. Aucune donnée statique / de démonstration : un champ non
 * renseigné vaut `null` et doit être MASQUÉ par l'appelant (jamais remplacé par
 * un numéro/adresse fictif).
 */
export type PublicContact = {
  /** Nom commercial affiché (toujours défini pour un tenant : son nom). */
  name: string | null
  email: string | null
  /** Téléphone formaté pour l'affichage. */
  phone: string | null
  /** Téléphone nettoyé pour les liens tel:. */
  phoneRaw: string | null
  /** Adresse complète sur une ligne. */
  address: string | null
  /** Site web éventuel de l'entreprise. */
  website: string | null
}

const EMPTY: PublicContact = {
  name: null,
  email: null,
  phone: null,
  phoneRaw: null,
  address: null,
  website: null,
}

/** Construit les coordonnées publiques à partir d'un tenant + ses settings. */
async function buildForTenant(tenant: Tenant): Promise<PublicContact> {
  const [s] = await db
    .select({
      businessName: settings.businessName,
      businessEmail: settings.businessEmail,
      businessPhone: settings.businessPhone,
      businessAddress: settings.businessAddress,
    })
    .from(settings)
    .where(eq(settings.companyId, tenant.id))
    .limit(1)

  const clean = (v: string | null | undefined) => {
    const t = (v ?? "").trim()
    return t ? t : null
  }

  const phone = clean(s?.businessPhone) ?? clean(tenant.phone)
  const email = clean(s?.businessEmail) ?? clean(tenant.email)
  const companyAddress =
    [tenant.address, [tenant.postalCode, tenant.city].filter(Boolean).join(" ")]
      .map((p) => (p ?? "").trim())
      .filter(Boolean)
      .join(", ") || null
  const address = clean(s?.businessAddress) ?? companyAddress
  const name = clean(s?.businessName) ?? clean(tenant.name)

  return {
    name,
    email,
    phone,
    phoneRaw: phone ? phone.replace(/[^\d+]/g, "") : null,
    address,
    website: clean(tenant.websiteUrl),
  }
}

/**
 * Coordonnées publiques du tenant courant (résolu via l'en-tête middleware).
 * Sur la vitrine racine DetailFlow (aucun tenant), renvoie des valeurs nulles :
 * cette vitrine possède son propre pied de page dans /marketing.
 * Mémoïsé par requête via `cache()`.
 */
export const getPublicContact = cache(async (): Promise<PublicContact> => {
  const tenant = await getCurrentTenant()
  if (!tenant) return EMPTY
  return buildForTenant(tenant)
})
