/**
 * Gabarit UNIQUE des pages de prestations Spirit ACS (composant SERVEUR).
 *
 * Une seule implémentation, alimentée par la configuration éditoriale
 * `ServiceContent` : les 6 pages partagent ce gabarit (aucun composant dupliqué).
 * Rendu DANS la coquille Spirit (`SpiritSiteShell`) pour conserver navigation,
 * pied de page et univers de marque. Contient :
 *   - fil d'Ariane visible + BreadcrumbList JSON-LD ;
 *   - un seul H1, introduction, bénéfices, déroulement, véhicules concernés ;
 *   - une sélection de réalisations existantes (si disponibles) ;
 *   - une FAQ spécifique + FAQPage JSON-LD (contenu identique au visible) ;
 *   - des liens vers 2-3 autres prestations ;
 *   - un CTA vers le formulaire de devis de l'accueil (tenant préservé).
 */

import Image from "next/image"
import Link from "next/link"
import type { CustomSitePublicData } from "@/lib/custom-sites/types"
import { withTenant } from "@/lib/tenant-link"
import { buildBreadcrumbJsonLd } from "@/lib/seo/structured-data"
import { tenantCanonicalUrl, tenantSeoIdentity } from "@/lib/seo/tenant-url"
import { SpiritSiteShell } from "./site-shell"
import { SpiritFaq } from "./spirit-faq"
import { Reveal } from "@/components/ui/reveal"
import { buildSpiritShellPropsForSubpage } from "./shell-props"
import { SPIRIT_SERVICES, type ServiceContent } from "./seo-content"

/** Sélectionne 3 autres prestations pour le maillage interne. */
function relatedServices(current: ServiceContent): ServiceContent[] {
  return SPIRIT_SERVICES.filter((s) => s.slug !== current.slug).slice(0, 3)
}

export async function SpiritServicePage({
  data,
  service,
}: {
  data: CustomSitePublicData
  service: ServiceContent
}) {
  const slug = data.tenant.slug
  const [shell, gallery] = await Promise.all([
    buildSpiritShellPropsForSubpage(data),
    data.getGallery(),
  ])

  // Fil d'Ariane : Accueil → Prestations → prestation courante. Les URL du
  // JSON-LD sont ABSOLUES et tenant-aware (canonique DetailFlow tant que le
  // domaine personnalisé n'est pas connecté).
  const identity = tenantSeoIdentity(data.tenant)
  const crumbs = [
    { name: "Accueil", href: "/", canonical: tenantCanonicalUrl("/", identity) },
    { name: "Prestations", href: `/#prestations`, canonical: tenantCanonicalUrl("/", identity) },
    {
      name: service.breadcrumbLabel,
      href: `/prestations/${service.slug}`,
      canonical: tenantCanonicalUrl(`/prestations/${service.slug}`, identity),
    },
  ]
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    crumbs.map((c) => ({ name: c.name, url: c.canonical })),
  )

  const quoteHref = withTenant(`/#demande-devis`, slug)
  const related = relatedServices(service)

  // Réalisations : on montre jusqu'à 3 comparateurs existants si disponibles
  // (aucune donnée inventée ; section masquée si la galerie est vide).
  const showcase = gallery.slice(0, 3)

  return (
    <SpiritSiteShell {...shell}>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <article className="bg-[var(--spirit-paper)] text-[color:var(--spirit-ink)]">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          {/* Fil d'Ariane visible */}
          <nav aria-label="Fil d'Ariane" className="text-sm text-[color:var(--spirit-muted)]">
            <ol className="flex flex-wrap items-center gap-1.5">
              {crumbs.map((c, i) => {
                const isLast = i === crumbs.length - 1
                return (
                  <li key={c.name} className="flex items-center gap-1.5">
                    {isLast ? (
                      <span aria-current="page" className="text-[color:var(--spirit-ink)]">
                        {c.name}
                      </span>
                    ) : (
                      <Link
                        href={withTenant(c.href, slug)}
                        className="transition-colors hover:text-[color:var(--spirit-teal)]"
                      >
                        {c.name}
                      </Link>
                    )}
                    {!isLast && <span aria-hidden="true">/</span>}
                  </li>
                )
              })}
            </ol>
          </nav>

          {/* H1 unique */}
          <Reveal>
            <span className="spirit-rule mt-6" />
            <h1 className="spirit-title spirit-h2 mt-4 text-balance leading-[1.05]">{service.h1}</h1>
          </Reveal>

          {/* Image illustrative réelle (si disponible) */}
          {service.image && (
            <Reveal delay={0.05}>
              <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-sm ring-1 ring-black/5">
                <Image
                  src={service.image || "/placeholder.svg"}
                  alt={service.imageAlt || service.cardTitle}
                  fill
                  sizes="(min-width: 1024px) 56rem, 100vw"
                  className="object-cover"
                  priority
                />
              </div>
            </Reveal>
          )}

          {/* Introduction */}
          <Reveal delay={0.05}>
            <div className="mt-8 space-y-4 text-pretty text-lg leading-relaxed text-[color:var(--spirit-ink)]/80">
              {service.intro.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </Reveal>

          {/* Bénéfices + Véhicules concernés */}
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <Reveal>
              <section aria-labelledby="benefices-title">
                <h2 id="benefices-title" className="spirit-title text-xl font-semibold">
                  Les bénéfices
                </h2>
                <ul className="mt-4 space-y-2">
                  {service.benefits.map((b) => (
                    <li key={b} className="flex gap-2 text-[color:var(--spirit-muted)]">
                      <span aria-hidden="true" className="mt-1 text-[color:var(--spirit-teal)]">
                        —
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
            <Reveal delay={0.05}>
              <section aria-labelledby="vehicules-title">
                <h2 id="vehicules-title" className="spirit-title text-xl font-semibold">
                  Véhicules concernés
                </h2>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {service.vehicles.map((v) => (
                    <li
                      key={v}
                      className="rounded-full bg-[var(--spirit-paper-2)] px-3 py-1 text-sm text-[color:var(--spirit-muted)] ring-1 ring-black/5"
                    >
                      {v}
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
          </div>

          {/* Déroulement général */}
          <Reveal>
            <section aria-labelledby="deroulement-title" className="mt-10">
              <h2 id="deroulement-title" className="spirit-title text-xl font-semibold">
                Comment se déroule la prestation ?
              </h2>
              <ol className="mt-4 space-y-3">
                {service.steps.map((s, i) => (
                  <li key={s} className="flex gap-3 text-[color:var(--spirit-muted)]">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--spirit-pink)]/15 text-sm font-semibold text-[color:var(--spirit-pink)]"
                    >
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          </Reveal>

          {/* CTA principal vers le formulaire de devis (accueil, tenant préservé) */}
          <Reveal>
            <div className="mt-10 rounded-sm bg-[var(--spirit-navy)] p-6 text-white sm:p-8">
              <h2 className="spirit-title text-xl font-semibold text-white sm:text-2xl">
                Un projet pour votre véhicule ?
              </h2>
              <p className="mt-2 text-white/75">Décrivez votre véhicule et la prestation souhaitée.</p>
              <Link
                href={quoteHref}
                className="mt-5 inline-flex items-center justify-center rounded-sm bg-[var(--spirit-pink)] px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Demander un devis
              </Link>
            </div>
          </Reveal>
        </div>
      </article>

      {/* Réalisations existantes (si disponibles) */}
      {showcase.length > 0 && (
        <section
          className="bg-[var(--spirit-paper-2)] text-[color:var(--spirit-ink)]"
          aria-labelledby="realisations-title"
        >
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
            <Reveal>
              <span className="spirit-rule" />
              <h2 id="realisations-title" className="spirit-title spirit-h2 mt-4 leading-[1.05]">
                Quelques réalisations
              </h2>
            </Reveal>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {showcase.map((item, i) => (
                <Reveal key={item.id ?? i} delay={i * 0.05}>
                  <figure className="overflow-hidden rounded-sm ring-1 ring-black/5">
                    <div className="relative aspect-[4/3]">
                      <Image
                        src={item.afterImageUrl || item.beforeImageUrl || "/placeholder.svg"}
                        alt={item.title?.trim() || "Réalisation Spirit ACS"}
                        fill
                        sizes="(min-width: 640px) 33vw, 100vw"
                        className="object-cover"
                        loading="lazy"
                      />
                    </div>
                    {item.title?.trim() && (
                      <figcaption className="p-3 text-sm text-[color:var(--spirit-muted)]">
                        {item.title}
                      </figcaption>
                    )}
                  </figure>
                </Reveal>
              ))}
            </div>
            <div className="mt-6">
              <Link
                href={withTenant("/#realisations", slug)}
                className="text-sm font-medium text-[color:var(--spirit-teal)] hover:underline"
              >
                Voir toutes les réalisations<span aria-hidden="true"> →</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* FAQ spécifique à la prestation (+ FAQPage JSON-LD identique au visible) */}
      <SpiritFaq
        entries={service.faq}
        title="Questions fréquentes"
        background="paper"
        headingId="service-faq-title"
      />

      {/* Maillage interne : autres prestations */}
      <section className="bg-[var(--spirit-paper-2)] text-[color:var(--spirit-ink)]" aria-labelledby="autres-title">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <Reveal>
            <span className="spirit-rule" />
            <h2 id="autres-title" className="spirit-title spirit-h2 mt-4 leading-[1.05]">
              Autres prestations
            </h2>
          </Reveal>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {related.map((r, i) => (
              <Reveal key={r.slug} delay={i * 0.05}>
                <Link
                  href={withTenant(`/prestations/${r.slug}`, slug)}
                  className="flex h-full flex-col gap-2 rounded-sm bg-[var(--spirit-paper)] p-5 ring-1 ring-black/5 transition-shadow hover:shadow-[0_18px_40px_-20px_rgba(6,19,28,0.5)]"
                >
                  <h3 className="spirit-title text-base font-semibold text-[color:var(--spirit-ink)]">
                    {r.cardTitle}
                  </h3>
                  <p className="text-sm leading-relaxed text-[color:var(--spirit-muted)]">{r.cardText}</p>
                  <span className="mt-auto pt-2 text-sm font-medium text-[color:var(--spirit-teal)]">
                    En savoir plus<span aria-hidden="true"> →</span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </SpiritSiteShell>
  )
}
