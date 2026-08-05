/**
 * PAGE D'ACCUEIL (vitrine du tenant)
 * Compose les sections à partir des données du tenant courant (base de données),
 * jamais des données statiques DetailFlow.
 * - Hero : nom du tenant.
 * - Prestations : catalogue du tenant (getPublicServices, filtré par companyId).
 * - CtaSection : coordonnées réelles du tenant.
 * Les blocs galerie / avis ne sont pas rendus : aucune donnée par tenant n'existe
 * en base, et afficher la galerie / les avis DetailFlow serait une fuite de
 * données commerciales entre entreprises (fallback neutre = section masquée).
 */

import { Hero } from "@/components/sections/hero"
import { ServicesPreview } from "@/components/sections/services-preview"
import { Process } from "@/components/sections/process"
import { CtaSection } from "@/components/sections/cta-section"
import { getPublicContact } from "@/lib/public-contact"

export default async function HomePage() {
  const contact = await getPublicContact()
  return (
    <>
      <Hero brandName={contact.name} hero={contact.hero} />
      <ServicesPreview />
      <Process />
      <CtaSection />
    </>
  )
}
