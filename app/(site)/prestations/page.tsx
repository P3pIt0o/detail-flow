import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { ServiceCard } from "@/components/service-card"
import { SectionHeading } from "@/components/ui/section-heading"
import { CtaSection } from "@/components/sections/cta-section"
import { Reveal } from "@/components/ui/reveal"
import { Check } from "lucide-react"
import { getPublicServices } from "@/lib/catalog-queries"
import { getCategories, getVehicleTypes, getOptions } from "@/lib/booking/queries"
import { CustomRequestCard } from "@/components/custom-request-card"
import { getPublicCustomRequestsConfig } from "@/lib/site-content"
import { resolveCustomRequestTexts } from "@/lib/custom-requests"
import { getCurrentTenant } from "@/lib/tenant"
import { withTenant } from "@/lib/tenant-link"
import { requireWebsiteFeature } from "@/lib/licensing/website-guard"

export const metadata: Metadata = {
  title: "Prestations",
  description:
    "Découvrez nos prestations de detailing : lavage premium, rénovation carrosserie, protection céramique et nettoyage intérieur. Tarifs selon le type de véhicule.",
  alternates: { canonical: "/prestations" },
}

function formatPrice(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "Sur devis"
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

export default async function PrestationsPage() {
  // Garde du site vitrine (feature website). LEGACY / domaine racine => autorisé.
  await requireWebsiteFeature()

  // Données dynamiques, scopées au tenant courant (isolation via companyId).
  const [visibleServices, categories, vehicles, options, crConfig, tenant] = await Promise.all([
    getPublicServices(),
    getCategories(),
    getVehicleTypes(),
    getOptions(),
    getPublicCustomRequestsConfig(),
    getCurrentTenant(),
  ])

  // Card « Demande personnalisée » : affichée UNIQUEMENT si l'entreprise a
  // activé la fonctionnalité (sinon page identique à aujourd'hui).
  const crTexts = resolveCustomRequestTexts(crConfig)
  const demandeHref = withTenant("/demande", tenant?.slug ?? null)

  // Prestations sans catégorie regroupées à part.
  const uncategorized = visibleServices.filter(
    (s) => !categories.some((c) => c.id === s.categoryId),
  )

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
              {category.description && <p className="mt-2 text-muted-foreground">{category.description}</p>}
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

      {/* Prestations sans catégorie */}
      {uncategorized.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          {categories.length > 0 && (
            <div className="mb-10">
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Autres prestations</h2>
            </div>
          )}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {uncategorized.map((service, i) => (
              <Reveal key={service.id} delay={i * 0.08}>
                <ServiceCard service={service} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* État vide : aucune prestation visible pour ce tenant */}
      {visibleServices.length === 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <p className="text-muted-foreground">
            Les prestations seront bientôt disponibles. Contactez-nous pour en savoir plus.
          </p>
        </section>
      )}

      {/* Demande personnalisée (facultatif, activé par l'entreprise) */}
      {crConfig.enabled && (
        <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Reveal>
              <CustomRequestCard
                title={crTexts.title}
                description={crTexts.description}
                ctaLabel={crTexts.ctaLabel}
                href={demandeHref}
              />
            </Reveal>
          </div>
        </section>
      )}

      {/* Tarification par type de véhicule + options */}
      {(vehicles.length > 0 || options.length > 0) && (
        <section className="border-y border-border bg-card/30">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Tarification"
              title="Adaptée à votre véhicule"
              subtitle="Le tarif de base est ajusté selon la taille de votre véhicule. Ajoutez des options pour un résultat encore plus complet."
            />

            <div className="mt-14 grid gap-8 lg:grid-cols-2">
              {/* Types de véhicules */}
              {vehicles.length > 0 && (
                <Reveal>
                  <div className="rounded-2xl border border-border bg-background p-6 sm:p-8">
                    <h3 className="text-lg font-semibold text-foreground">Types de véhicules</h3>
                    <ul className="mt-6 divide-y divide-border">
                      {vehicles.map((v) => (
                        <li key={v.id} className="flex items-center justify-between py-3">
                          <span className="text-foreground">{v.name}</span>
                          <span className="text-sm text-muted-foreground">Tarif ajusté</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              )}

              {/* Options complémentaires */}
              {options.length > 0 && (
                <Reveal delay={0.1}>
                  <div className="rounded-2xl border border-border bg-background p-6 sm:p-8">
                    <h3 className="text-lg font-semibold text-foreground">Options complémentaires</h3>
                    <ul className="mt-6 space-y-3">
                      {options.map((opt) => (
                        <li key={opt.id} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-3 text-foreground">
                            <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                            {opt.name}
                          </span>
                          <span className="shrink-0 text-sm font-medium text-primary">+ {formatPrice(opt.priceCents)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              )}
            </div>
          </div>
        </section>
      )}

      <CtaSection />
    </>
  )
}
