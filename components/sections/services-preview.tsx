/**
 * Aperçu des prestations sur la page d'accueil.
 * Affiche les prestations "featured" (mises en avant) puis un lien vers la
 * page complète. Les données viennent de config/content.ts (future DB).
 */

import { services } from "@/config/content"
import { SectionHeading } from "@/components/ui/section-heading"
import { ServiceCard } from "@/components/service-card"
import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"

export function ServicesPreview() {
  // On montre en priorité les prestations mises en avant, sinon les premières.
  const visible = services.filter((s) => s.visible)
  const featured = visible.filter((s) => s.featured)
  const list = (featured.length > 0 ? featured : visible).slice(0, 3)

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <SectionHeading
        eyebrow="Nos prestations"
        title="Un savoir-faire complet"
        description="Du lavage premium à la protection céramique, chaque prestation est réalisée avec des produits professionnels et une attention au détail sans compromis."
      />

      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {list.map((service, i) => (
          <Reveal key={service.id} delay={i * 0.1}>
            <ServiceCard service={service} />
          </Reveal>
        ))}
      </div>

      <div className="mt-12 flex justify-center">
        <CtaButton href="/prestations" variant="outline" size="lg" showArrow>
          Découvrir toutes les prestations
        </CtaButton>
      </div>
    </section>
  )
}
