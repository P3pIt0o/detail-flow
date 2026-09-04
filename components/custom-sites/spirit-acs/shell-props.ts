/**
 * Dérivation MUTUALISÉE des props de la coquille Spirit (`SpiritSiteShell`) à
 * partir du contrat public `CustomSitePublicData`. Utilisé par l'accueil ET par
 * les pages de prestations pour ne pas dupliquer la logique de navigation, de
 * logo et de CTA. Aucune donnée métier dupliquée : tout vient du contrat public.
 */

import type { CustomSitePublicData } from "@/lib/custom-sites/types"
import { SPIRIT_SECTIONS, SPIRIT_LOGO_FALLBACK, type SpiritNavItem, type SpiritResolvedContent } from "./tokens"

export type SpiritShellProps = {
  brandName: string
  logoSrc: string | null
  navItems: SpiritNavItem[]
  ctaHref: string
  ctaLabel: string
  phone: string | null
  phoneRaw: string | null
  email: string | null
  city: string | null
  footerTagline: string | null
}

/**
 * Construit les props de la coquille pour une PAGE SECONDAIRE (hors accueil).
 * Les ancres de section renvoient vers l'accueil (avec tenant préservé) puisque
 * ces sections ne vivent que sur l'accueil ; « Contact » ouvre `/contact`.
 * Le CTA « Demander un devis » pointe vers le formulaire de l'accueil.
 */
export async function buildSpiritShellPropsForSubpage(
  data: CustomSitePublicData,
): Promise<SpiritShellProps> {
  const [contact, contentRaw] = await Promise.all([data.getContact(), data.getContent()])
  const content = contentRaw as SpiritResolvedContent
  const slug = data.tenant.slug
  const brandName = contact.name?.trim() || data.tenant.name
  const logoSrc = data.tenant.logoUrl
    ? `/api/company-logo?company=${encodeURIComponent(slug)}`
    : SPIRIT_LOGO_FALLBACK

  // Ancres d'accueil + page Contact, en tant qu'éléments de ROUTE (page
  // secondaire → tous les liens de section pointent vers l'accueil). Le tenant
  // est ajouté PAR la navigation (`withTenant` interne) : on passe donc des
  // routes BRUTES ici pour ne pas dupliquer « ?tenant= ».
  const navItems: SpiritNavItem[] = [
    { id: SPIRIT_SECTIONS.prestations, label: "Prestations", route: `/#${SPIRIT_SECTIONS.prestations}` },
    { id: SPIRIT_SECTIONS.apropos, label: "À propos", route: `/#${SPIRIT_SECTIONS.apropos}` },
    { id: SPIRIT_SECTIONS.faq, label: "FAQ", route: `/#${SPIRIT_SECTIONS.faq}` },
    { id: SPIRIT_SECTIONS.contact, label: "Contact", route: "/contact" },
  ]

  // CTA d'en-tête vers le formulaire de l'accueil. Route BRUTE commençant par
  // « / » : la nav applique `withTenant` une seule fois (le tenant n'est donc
  // pas dupliqué).
  const ctaHref = `/#${SPIRIT_SECTIONS.demandeDevis}`
  const footerTagline = content.footer.tagline?.trim() || null

  return {
    brandName,
    logoSrc,
    navItems,
    ctaHref,
    ctaLabel: "Demander un devis",
    phone: contact.phone,
    phoneRaw: contact.phoneRaw,
    email: contact.email,
    city: contact.city,
    footerTagline,
  }
}
