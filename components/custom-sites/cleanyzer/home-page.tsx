/**
 * Page d'accueil CLEANYZER (maquette Phase 1, isolée sous /cleanyzer-preview).
 * Ordre conversion : hero → univers/prestations → prestations/tarifs →
 * réalisations → service à domicile → zone → avis → FAQ → CTA final.
 */

import { CleanyzerShell } from "./site-shell"
import { CleanyzerHero } from "./hero"
import {
  UniversSection,
  PrestationsPreview,
  RealisationsPreview,
  ServiceADomicile,
  ZoneSection,
  AvisSection,
  FaqSection,
  FinalCta,
} from "./home-sections"
import { CLZ_NAV_ITEMS } from "./nav"

export function CleanyzerHome() {
  return (
    <CleanyzerShell navItems={CLZ_NAV_ITEMS}>
      <CleanyzerHero />
      <UniversSection />
      <PrestationsPreview />
      <RealisationsPreview />
      <ServiceADomicile />
      <ZoneSection />
      <AvisSection />
      <FaqSection />
      <FinalCta />
    </CleanyzerShell>
  )
}
