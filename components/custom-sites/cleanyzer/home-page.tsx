/**
 * Page d'accueil CLEANYZER (maquette Phase 1, isolée sous /cleanyzer-preview).
 * Ordre conversion : hero → univers/prestations → prestations/tarifs →
 * prestations au défilement (vidéos de Tom) → réalisations → avant/après et
 * galerie → service à domicile → zone → avis → FAQ → CTA final.
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
import { CLZ_SITE_NAV_ITEMS } from "./nav"
import { ClzReveal } from "./motion"
import { PrestationsFilm } from "./prestations-film"
import { Visit3D } from "./visit-3d"
import { RealisationsTom } from "./realisations-tom"
import { CLZ_FAQ } from "./faq-content"
import { buildFaqJsonLd } from "@/lib/seo/structured-data"

// Contrat public identique à SpiritAcsHome / RozanHome : le tenant est résolu
// côté serveur et injecté ici par le dispatch (registry). `data` est OPTIONNEL
// pour que l'aperçu (`/cleanyzer-preview`) puisse rendre la page sans contexte
// tenant. PHASE VISUELLE : le contenu reste éditorial (content.ts) ; `data`
// sera consommé ultérieurement (prestations/avis/galerie réels par tenant)
// sans changer ce câblage ni impacter les autres tenants.
export async function CleanyzerHome({ data }: { data?: CustomSitePublicData }) {
  // Coordonnées RÉELLES du tenant (DetailFlow) pour le pied de page (NAP).
  // Aperçu sans tenant → aucune coordonnée affichée.
  const contact = data ? await data.getContact() : null
  // FAQPage : EXACTEMENT les questions/réponses affichées dans la section FAQ.
  const faqJsonLd = buildFaqJsonLd(CLZ_FAQ.map((e) => ({ question: e.q, answer: e.a })))
  return (
    <CleanyzerShell
      navItems={CLZ_SITE_NAV_ITEMS}
      immersive
      contact={contact ? { phone: contact.phone, phoneRaw: contact.phoneRaw, email: contact.email } : null}
    >
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }}
      />
      <CleanyzerHero />
      <Visit3D />
      <UniversSection />
      <PrestationsPreview />
      <PrestationsFilm />
      <RealisationsPreview />
      <RealisationsTom />
      <ServiceADomicile />
      <AProposSection />
      <ZoneSection />
      <AvisSection />
      <FaqSection />
      <FinalCta />
      <ClzReveal />
    </CleanyzerShell>
  )
}
