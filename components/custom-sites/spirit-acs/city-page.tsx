/**
 * Page ville de Spirit ACS (`/detailing/<commune>`, L85). Composant SERVEUR.
 *
 * Un gabarit pour les 5 communes ; seuls le titre, l'introduction et les
 * communes proches changent (aucune information locale inventée). La FAQ de
 * l'accueil est affichée SANS JSON-LD FAQPage (D5 : pas de 5 blocs identiques).
 */

import Link from "next/link"
import type { CustomSitePublicData } from "@/lib/custom-sites/types"
import { withTenant } from "@/lib/tenant-link"
import { Reveal } from "@/components/ui/reveal"
import { SpiritSiteShell } from "./site-shell"
import { SpiritFaq } from "./spirit-faq"
import { buildSpiritShellPropsForSubpage } from "./shell-props"
import { SPIRIT_CITY, SPIRIT_FAQ, SPIRIT_ZONE_PATH, spiritCityPath, type SpiritCityPage } from "./seo-content"
import { SpiritBookButton, SpiritBookCta, SpiritCityChip, SpiritCrumbs, SpiritPriceList } from "./zone-page"

export async function SpiritCityPageView({ data, page }: { data: CustomSitePublicData; page: SpiritCityPage }) {
  const slug = data.tenant.slug
  const shell = await buildSpiritShellPropsForSubpage(data)

  return (
    <SpiritSiteShell {...shell}>
      <article className="bg-[var(--spirit-paper)] text-[color:var(--spirit-ink)]">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <SpiritCrumbs
            tenantSlug={slug}
            items={[
              { name: "Accueil", path: "/" },
              { name: "Zone d'intervention", path: SPIRIT_ZONE_PATH },
              { name: page.city, path: spiritCityPath(page.slug) },
            ]}
          />

          <Reveal>
            <span className="spirit-rule mt-6" />
            <h1 className="spirit-title spirit-h2 mt-4 text-balance leading-[1.05]">{page.h1}</h1>
          </Reveal>

          <Reveal delay={0.05}>
            <p className="mt-6 text-pretty text-lg leading-relaxed text-[color:var(--spirit-ink)]/80">{page.intro}</p>
            <div className="mt-6">
              <SpiritBookButton tenantSlug={slug} />
            </div>
          </Reveal>

          <Reveal>
            <section aria-labelledby="tarifs-title" className="mt-10">
              <h2 id="tarifs-title" className="spirit-title text-xl font-semibold">
                Prestations et tarifs
              </h2>
              <SpiritPriceList tenantSlug={slug} />
            </section>
          </Reveal>

          <Reveal>
            <section aria-labelledby="proches-title" className="mt-10">
              <h2 id="proches-title" className="spirit-title text-xl font-semibold">
                Communes proches desservies
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {page.nearby.map((c) =>
                  c === SPIRIT_CITY ? (
                    // Lagny-sur-Marne (ville de base) = la page d'accueil.
                    <li key={c}>
                      <Link
                        href={withTenant("/", slug)}
                        className="inline-block rounded-full bg-white px-3 py-1 text-sm text-[color:var(--spirit-muted)] ring-1 ring-black/10 transition-colors hover:text-[color:var(--spirit-teal)]"
                      >
                        {c}
                      </Link>
                    </li>
                  ) : (
                    <SpiritCityChip key={c} city={c} tenantSlug={slug} />
                  ),
                )}
                <li>
                  <Link
                    href={withTenant(SPIRIT_ZONE_PATH, slug)}
                    className="inline-block rounded-full bg-white px-3 py-1 text-sm font-semibold text-[color:var(--spirit-teal)] ring-1 ring-[var(--spirit-teal)] transition-colors hover:bg-[var(--spirit-teal)]/10"
                  >
                    Toute la zone<span aria-hidden="true"> →</span>
                  </Link>
                </li>
              </ul>
            </section>
          </Reveal>
        </div>
      </article>

      <SpiritFaq entries={SPIRIT_FAQ} withJsonLd={false} background="paper-2" headingId="city-faq-title" />

      <div className="bg-[var(--spirit-paper)]">
        <div className="mx-auto max-w-4xl px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16">
          <Reveal>
            <SpiritBookCta tenantSlug={slug} />
          </Reveal>
        </div>
      </div>
    </SpiritSiteShell>
  )
}
