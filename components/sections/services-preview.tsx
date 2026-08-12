import { SectionHeading } from "@/components/ui/section-heading"
import { ServiceCard } from "@/components/service-card"
import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"
import { getPublicServices } from "@/lib/catalog-queries"
import { getPublicSiteContent, getPublicServicesEyebrow } from "@/lib/site-content"

export async function ServicesPreview() {
  const [services, content, eyebrow] = await Promise.all([
    getPublicServices(),
    getPublicSiteContent(),
    getPublicServicesEyebrow(),
  ])

  // On conserve l'image réelle de chaque prestation (pathname Blob privé résolu,
  // URL héritée, ou image par défaut) telle que renvoyée par getPublicServices.
  // Auparavant elle était écrasée par des fichiers statiques, ce qui masquait
  // toute image téléversée par le tenant sur la page d'accueil.
  const list = services.slice(0, 3)

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <SectionHeading eyebrow={eyebrow ?? undefined} title={content.services.title} subtitle={content.services.intro} />

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
