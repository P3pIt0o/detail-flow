/**
 * Page d'accueil CLEANYZER (maquette Phase 1, isolée sous /cleanyzer-preview).
 * Ordre conversion : hero → univers/prestations → prestations/tarifs →
 * réalisations → service à domicile → zone → avis → FAQ → CTA final.
 */

import type { CustomSitePublicData } from "@/lib/custom-sites/types"
import { CleanyzerShell } from "./site-shell"
import { CleanyzerHero } from "./hero"
import {
  UniversSection,
  PrestationsPreview,
  RealisationsPreview,
  ServiceADomicile,
  AProposSection,
  ZoneSection,
  AvisSection,
  FaqSection,
  FinalCta,
} from "./home-sections"
import { CLZ_NAV_ITEMS } from "./nav"

// Contrat public identique à SpiritAcsHome / RozanHome : le tenant est résolu
// côté serveur et injecté ici par le dispatch (registry). `data` est OPTIONNEL
// pour que l'aperçu (`/cleanyzer-preview`) puisse rendre la page sans contexte
// tenant. PHASE VISUELLE : le contenu reste éditorial (content.ts) ; `data`
// sera consommé ultérieurement (prestations/avis/galerie réels par tenant)
// sans changer ce câblage ni impacter les autres tenants.
export function CleanyzerHome({ data }: { data?: CustomSitePublicData }) {
  void data
  return (
    <CleanyzerShell navItems={CLZ_NAV_ITEMS}>
      <CleanyzerHero />
      <UniversSection />
      <PrestationsPreview />
      <RealisationsPreview />
      <ServiceADomicile />
      <AProposSection />
      <ZoneSection />
      <AvisSection />
      <FaqSection />
      <FinalCta />
    </CleanyzerShell>
  )
}
