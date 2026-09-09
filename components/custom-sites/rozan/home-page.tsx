/**
 * Page d'accueil du site personnalisé Rozan Cleaning Services.
 *
 * PHASE 2 : composant autonome assemblant la coquille + les sections, avec le
 * contenu éditorial de démonstration (`content.ts`). En Phase 4, il sera adapté
 * pour recevoir `CustomSitePublicData` (contrat public par tenant) exactement
 * comme `SpiritAcsHome`, et enregistré dans `meta.ts` + `registry.ts` sous la
 * clé « rozan » — sans impacter Spirit ni les autres tenants.
 *
 * Ordre orienté conversion : hero → confiance → prestations → avant/après →
 * pourquoi → process → avis → zones → devis → FAQ → CTA final.
 */

import { RozanSiteShell } from "./site-shell"
import { RozanHero } from "./rozan-hero"
import { RozanTrustBar } from "./rozan-trust-bar"
import { RozanPrestations } from "./rozan-prestations"
import { RozanAvantApres } from "./rozan-avant-apres"
import { RozanPourquoi } from "./rozan-pourquoi"
import { RozanProcess } from "./rozan-process"
import { RozanAvis } from "./rozan-avis"
import { RozanZones } from "./rozan-zones"
import { RozanDevis } from "./rozan-devis"
import { RozanFaq } from "./rozan-faq"
import { RozanFinalCta } from "./rozan-final-cta"
import { ROZAN_SECTIONS, type RozanNavItem } from "./tokens"
import { ROZAN_BRAND } from "./content"

const NAV_ITEMS: RozanNavItem[] = [
  { id: ROZAN_SECTIONS.prestations, label: "Prestations" },
  { id: ROZAN_SECTIONS.avantApres, label: "Avant / Après" },
  { id: ROZAN_SECTIONS.zones, label: "Zones d'intervention" },
  { id: ROZAN_SECTIONS.avis, label: "Avis" },
  { id: ROZAN_SECTIONS.faq, label: "FAQ" },
]

export function RozanHome() {
  return (
    <RozanSiteShell
      brandName={ROZAN_BRAND.name}
      navItems={NAV_ITEMS}
      ctaHref={`#${ROZAN_SECTIONS.devis}`}
      ctaLabel="Obtenir mon devis"
      phoneRaw={ROZAN_BRAND.phoneRaw}
      phoneLabel={ROZAN_BRAND.phone}
      stickyCtaHref={`#${ROZAN_SECTIONS.devis}`}
      stickyCtaLabel="Obtenir mon devis"
      immersive
    >
      <RozanHero />
      <RozanTrustBar />
      <RozanPrestations />
      <RozanAvantApres />
      <RozanPourquoi />
      <RozanProcess />
      <RozanAvis />
      <RozanZones />
      <RozanDevis />
      <RozanFaq />
      <RozanFinalCta />
    </RozanSiteShell>
  )
}
