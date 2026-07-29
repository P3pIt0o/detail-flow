import type { Metadata } from "next"
import { categories, services, vehicleTypes, serviceOptions } from "@/config/content"
import { PageHeader } from "@/components/layout/page-header"
import { ServiceCard } from "@/components/service-card"
import { SectionHeading } from "@/components/ui/section-heading"
import { CtaSection } from "@/components/sections/cta-section"
import { Reveal } from "@/components/ui/reveal"
import { Check } from "lucide-react"

export const metadata: Metadata = {
  title: "Prestations",
  description:
    "Découvrez nos prestations de detailing : lavage premium, rénovation carrosserie, protection céramique et nettoyage intérieur. Tarifs selon le type de véhicule.",
  alternates: { canonical: "/prestations" },
}

export default function PrestationsPage() {
  const visibleServices = services.filter((s) => s.visible).sort((a, b) => a.order - b.order)

  return (
    <>
      <PageHeader
        eyebrow="Nos prestations"
        title="Des soins sur mesure pour votre véhicule"
        description="Chaque prestation est réalisée avec des produits professionnels et un protocole rigoureux. Les tarifs s'adaptent au type de véhicule et aux options choisies."
      />

      {/* Prestations groupées par catégorie */}
      {categories.map((category) => {
        const items = visibleServices.filter((s) => s.categoryId === category.id)
        if (items.length === 0) return null
        return (
          <section key={category.id} className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="mb-10">
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{category.name}</h2>
              <p className="mt-2 text-muted-foreground">{category.description}</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {items.map((service, i) => (
                <Reveal key={service.id} delay={i * 0.08}>
                  <ServiceCard service={service} />
                </Reveal>
              ))}
            </div>
          </section>
        )
      })}

      {/* Tarification par type de véhicule + options */}
      <section className="border-y border-border bg-card/30">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Tarification"
            title="Adaptée à votre véhicule"
            description="Le tarif de base est ajusté selon la taille de votre véhicule. Ajoutez des options pour un résultat encore plus complet."
          />

          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            {/* Types de véhicules */}
            <Reveal>
              <div className="rounded-2xl border border-border bg-background p-6 sm:p-8">
                <h3 className="text-lg font-semibold text-foreground">Types de véhicules</h3>
                <ul className="mt-6 divide-y divide-border">
                  {vehicleTypes.map((v) => (
                    <li key={v.id} className="flex items-center justify-between py-3">
                      <span className="text-foreground">{v.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {v.priceMultiplier === 1 ? "Tarif de base" : `× ${v.priceMultiplier.toFixed(2)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            {/* Options complémentaires */}
            <Reveal delay={0.1}>
              <div className="rounded-2xl border border-border bg-background p-6 sm:p-8">
                <h3 className="text-lg font-semibold text-foreground">Options complémentaires</h3>
                <ul className="mt-6 space-y-3">
                  {serviceOptions.map((opt) => (
                    <li key={opt.id} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-3 text-foreground">
                        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        {opt.name}
                      </span>
                      <span className="shrink-0 text-sm font-medium text-primary">+ {opt.price} €</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <CtaSection />
    </>
  )
}
