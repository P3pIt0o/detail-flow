/**
 * Page « Zone d'intervention » de Spirit ACS (`/zone-intervention`, L85).
 * Composant SERVEUR rendu dans la coquille Spirit.
 *
 * Contenu : les 14 communes confirmées (`SPIRIT_CITIES`, 5 ouvrent leur page),
 * le principe du déplacement, les prestations avec leur prix « dès » TOUJOURS
 * suivi du nom de la formule (D1), et un bouton vers le formulaire de l'accueil.
 * Aucune information locale inventée.
 *
 * Exporte aussi les blocs partagés avec les pages ville (`city-page.tsx`).
 */

import Link from "next/link"
import type { CustomSitePublicData } from "@/lib/custom-sites/types"
import { withTenant } from "@/lib/tenant-link"
import { buildBreadcrumbJsonLd } from "@/lib/seo/structured-data"
import { tenantCanonical } from "@/lib/seo/tenant-seo.server"
import { Reveal } from "@/components/ui/reveal"
import { SpiritSiteShell } from "./site-shell"
import { buildSpiritShellPropsForSubpage } from "./shell-props"
import { SPIRIT_SECTIONS } from "./tokens"
import {
  SPIRIT_CITIES,
  SPIRIT_SERVICES,
  SPIRIT_ZONE_PAGE,
  SPIRIT_ZONE_PATH,
  SPIRIT_ZONE_TEXTILE_NOTE,
  spiritCityPageFor,
  spiritCityPath,
} from "./seo-content"
import { spiritStartingPriceParts } from "./service-offers"

/** Libellé du bouton de réservation (D2 : mène au formulaire de l'accueil). */
export const SPIRIT_BOOK_LABEL = "Réserver une prestation"
/** Destination du bouton : formulaire de demande de l'accueil. */
export const SPIRIT_BOOK_PATH = `/#${SPIRIT_SECTIONS.demandeDevis}`

const BTN =
  "inline-flex items-center justify-center rounded-sm bg-[var(--spirit-pink)] px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"

/** Fil d'Ariane visible + BreadcrumbList JSON-LD (URL canoniques absolues). */
export async function SpiritCrumbs({
  items,
  tenantSlug,
}: {
  items: Array<{ name: string; path: string }>
  tenantSlug: string
}) {
  const canonicals = await Promise.all(items.map((c) => tenantCanonical(c.path)))
  const jsonLd = buildBreadcrumbJsonLd(items.map((c, i) => ({ name: c.name, url: canonicals[i] })))
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Fil d'Ariane" className="text-sm text-[color:var(--spirit-muted)]">
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((c, i) => {
            const isLast = i === items.length - 1
            return (
              <li key={c.path} className="flex items-center gap-1.5">
                {isLast ? (
                  <span aria-current="page" className="text-[color:var(--spirit-ink)]">
                    {c.name}
                  </span>
                ) : (
                  <Link
                    href={withTenant(c.path, tenantSlug)}
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
    </>
  )
}

/**
 * Prestations et prix « dès » : le plus petit montant du code, suivi du nom de
 * sa formule ; « Sur devis » si la prestation n'a aucun montant publié.
 * Chaque ligne ouvre la page de la prestation.
 */
export function SpiritPriceList({ tenantSlug }: { tenantSlug: string }) {
  return (
    <>
      <ul className="mt-4 divide-y divide-black/5 rounded-sm bg-[var(--spirit-paper-2)] ring-1 ring-black/5">
        {SPIRIT_SERVICES.map((s) => {
          const price = spiritStartingPriceParts(s)
          return (
            <li key={s.slug}>
              <Link
                href={withTenant(`/prestations/${s.slug}`, tenantSlug)}
                className="flex flex-col gap-1 p-4 transition-colors hover:bg-white/60 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="font-medium text-[color:var(--spirit-ink)]">{s.cardTitle}</span>
                <span className="sm:text-right">
                  {price ? (
                    <>
                      <span className="whitespace-nowrap font-semibold text-[color:var(--spirit-teal)]">
                        {price.amount}
                      </span>{" "}
                      <span className="text-sm text-[color:var(--spirit-muted)]">· {price.detail}</span>
                    </>
                  ) : (
                    <span className="font-semibold text-[color:var(--spirit-teal)]">Sur devis</span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-sm text-[color:var(--spirit-muted)]">
        Le tarif final dépend du véhicule et de la prestation. Certaines prestations sont sur devis.
      </p>
      <p className="mt-1 text-sm text-[color:var(--spirit-muted)]">{SPIRIT_ZONE_TEXTILE_NOTE}</p>
    </>
  )
}

/** Encart de fin de page avec le bouton de réservation. */
export function SpiritBookCta({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="mt-10 rounded-sm bg-[var(--spirit-navy)] p-6 text-white sm:p-8">
      <h2 className="spirit-title text-xl font-semibold text-white sm:text-2xl">Un projet pour votre véhicule ?</h2>
      <Link href={withTenant(SPIRIT_BOOK_PATH, tenantSlug)} className={`mt-5 ${BTN}`}>
        {SPIRIT_BOOK_LABEL}
      </Link>
    </div>
  )
}

/** Bouton de réservation seul (haut des pages ville). */
export function SpiritBookButton({ tenantSlug }: { tenantSlug: string }) {
  return (
    <Link href={withTenant(SPIRIT_BOOK_PATH, tenantSlug)} className={BTN}>
      {SPIRIT_BOOK_LABEL}
    </Link>
  )
}

/** Pastille de commune : cliquable si la commune a une page dédiée. */
export function SpiritCityChip({ city, tenantSlug }: { city: string; tenantSlug: string }) {
  const page = spiritCityPageFor(city)
  if (page) {
    return (
      <li>
        <Link
          href={withTenant(spiritCityPath(page.slug), tenantSlug)}
          className="inline-block rounded-full bg-white px-3 py-1 text-sm font-semibold text-[color:var(--spirit-teal)] ring-1 ring-[var(--spirit-teal)] transition-colors hover:bg-[var(--spirit-teal)]/10"
        >
          {city}
        </Link>
      </li>
    )
  }
  return (
    <li className="rounded-full bg-white px-3 py-1 text-sm text-[color:var(--spirit-muted)] ring-1 ring-black/10">
      {city}
    </li>
  )
}

export async function SpiritZonePage({ data }: { data: CustomSitePublicData }) {
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
            ]}
          />

          <Reveal>
            <span className="spirit-rule mt-6" />
            <h1 className="spirit-title spirit-h2 mt-4 text-balance leading-[1.05]">{SPIRIT_ZONE_PAGE.h1}</h1>
          </Reveal>

          <Reveal delay={0.05}>
            <p className="mt-6 text-pretty text-lg leading-relaxed text-[color:var(--spirit-ink)]/80">
              {SPIRIT_ZONE_PAGE.intro}
            </p>
          </Reveal>

          <Reveal>
            <section aria-labelledby="communes-title" className="mt-10">
              <h2 id="communes-title" className="spirit-title text-xl font-semibold">
                Les {SPIRIT_CITIES.length} communes desservies
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Communes desservies">
                {SPIRIT_CITIES.map((c) => (
                  <SpiritCityChip key={c} city={c} tenantSlug={slug} />
                ))}
              </ul>
            </section>
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
            <SpiritBookCta tenantSlug={slug} />
          </Reveal>
        </div>
      </article>
    </SpiritSiteShell>
  )
}
