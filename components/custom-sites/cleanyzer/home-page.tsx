/**
 * Page d'accueil CLEANYZER.
 * Ordre (L35, maquette néon validée par Tom) : hero néon → présentation (vidéo de Tom au clic) →
 * avant/après → prestations & tarifs → produits & fournisseurs → visite en images (L55) → univers →
 * prestations au défilement → réalisations → service à domicile → zone → avis → témoignages →
 * FAQ → CTA final. « Derrière CLEANYZER » est remplacée par la présentation sur l'accueil.
 */

import type { CustomSitePublicData } from "@/lib/custom-sites/types"
import { CleanyzerShell } from "./site-shell"
import { CleanyzerHero } from "./hero"
import {
  UniversSection,
  PrestationsPreview,
  ServiceADomicile,
  ZoneSection,
  AvisSection,
  TemoignagesSection,
  FaqSection,
  FinalCta,
} from "./home-sections"
import { CLZ_SITE_NAV_ITEMS } from "./nav"
import { ClzReveal } from "./motion"
import { PrestationsFilm } from "./prestations-film"
import { VisitVideo } from "./visit-video"
import { ClzPresentation } from "./presentation"
import { ClzFournisseurs } from "./fournisseurs"
import { AvantApresSection, RealisationsTom } from "./realisations-tom"
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
      <ClzPresentation />
      <AvantApresSection />
      <PrestationsPreview />
      <ClzFournisseurs />
      <VisitVideo />
      <UniversSection />
      <PrestationsFilm />
      <RealisationsTom />
      <ServiceADomicile />
      <ZoneSection />
      <AvisSection />
      <TemoignagesSection />
      <FaqSection />
      <FinalCta />
      <ClzReveal />
    </CleanyzerShell>
  )
}
