/**
 * Pages PUBLIQUES indexables de CLEANYZER (production, composants serveur) :
 *   - `CleanyzerServicePage` → /prestations/{slug} (intérieur, extérieur, textile) ;
 *   - `CleanyzerZonePage`    → /zone-intervention-annecy.
 *
 * Contenu : `seo-content.ts` (textes) + `content.ts` (barème). Données
 * structurées : Service + offres à prix publiés, BreadcrumbList, FAQPage — la
 * FAQ balisée est EXACTEMENT celle affichée. L'établissement (AutoWash) est
 * déjà émis par le layout `app/(site)`.
 */

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Check, MapPin, Clock } from "lucide-react"
import { SEO_BASE, resolveTenantOrigin, tenantCanonicalUrl, tenantSeoIdentity } from "@/lib/seo/tenant-url"
import { buildBreadcrumbJsonLd, buildFaqJsonLd, buildServiceJsonLd } from "@/lib/seo/structured-data"
import { tenantCanonicalHost, tenantCanonicalPathPrefix } from "@/lib/tenant-shared"
import { CleanyzerShell, type ClzContact } from "./site-shell"
import { PageHero, DirectAnswer } from "./page-primitives"
import { CleanyzerFaq } from "./faq"
import { CLZ_SITE_NAV_ITEMS } from "./nav"
import { FormulaCard, CrossCta } from "./prestations"
import { PAIRS } from "./realisations-tom"
import { ZoneSection } from "./zone-section"
import { JOURNEY_ZONES, filmDeepLink, visitDeepLink, zonesForSide } from "./journey"
import { ZONE_COMMUNES, ZONE_SECTORS, joinNames } from "./zones"
import {
  BRAND,
  TEXTILE_BASE,
  TEXTILE_ITEMS,
  TEXTILE_SUPPLEMENTS,
  TRAVEL,
  VEHICLES,
  formulasFor,
  optionsFor,
} from "./content"
import {
  CLZ_AREA_SERVED,
  CLZ_PRICES,
  CLZ_SERVICE_PAGES,
  CLZ_ZONE_PAGE,
  type ClzFaq,
  type ClzServicePage,
} from "./seo-content"
import { CLEANYZER_TENANT_SLUG, CLZ_BOOKING_HREF, CLZ_DEMANDE_HREF, CLZ_HOME_HREF, clzPath } from "./tokens"
import "./prestations-film.css"

/* -------------------------------------------------------------------------- */
/*  URL canoniques + JSON-LD                                                   */
/* -------------------------------------------------------------------------- */

const IDENTITY = tenantSeoIdentity({
  slug: CLEANYZER_TENANT_SLUG,
  publicDomain: tenantCanonicalHost(CLEANYZER_TENANT_SLUG),
  publicPathPrefix: tenantCanonicalPathPrefix(CLEANYZER_TENANT_SLUG),
})

/** Origine absolue des fichiers publics (domaine connecté, sinon DetailFlow). */
const ASSET_ORIGIN = resolveTenantOrigin(IDENTITY) ?? SEO_BASE

/** URL canonique absolue d'une page CLEANYZER (même règle que les métadonnées). */
export function clzCanonical(path: string): string {
  return tenantCanonicalUrl(path, IDENTITY)
}

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  )
}

function faqJsonLd(entries: ClzFaq[]) {
  return buildFaqJsonLd(entries.map((e) => ({ question: e.q, answer: e.a })))
}

/** Offres à prix fixe publiés d'une prestation (les « sur devis » sont exclus). */
export function clzServiceOffers(page: ClzServicePage): { name: string; price: number }[] {
  if (page.kind === "textile") {
    return TEXTILE_ITEMS.filter((t) => t.price != null && !t.priceLabel.startsWith("à partir")).map((t) => ({
      name: t.label,
      price: t.price as number,
    }))
  }
  return formulasFor(page.kind).flatMap((f) =>
    VEHICLES.flatMap((v) => {
      const price = f.prices[v.key]
      return price == null ? [] : [{ name: `${f.name} ${page.kind === "interieur" ? "intérieur" : "extérieur"} — ${v.label}`, price }]
    }),
  )
}

/* -------------------------------------------------------------------------- */
/*  Blocs partagés                                                             */
/* -------------------------------------------------------------------------- */

function Related({ current }: { current?: string }) {
  const items = [
    ...CLZ_SERVICE_PAGES.filter((p) => p.slug !== current).map((p) => ({
      href: clzPath(`/prestations/${p.slug}`),
      label: p.h1.replace(/ à domicile à Annecy$/, ""),
      sub:
        p.kind === "interieur"
          ? `à partir de ${CLZ_PRICES.interieurMin} €`
          : p.kind === "exterieur"
            ? `à partir de ${CLZ_PRICES.exterieurMin} €`
            : `canapé à partir de ${CLZ_PRICES.textileMin} €`,
    })),
    ...(current === CLZ_ZONE_PAGE.slug
      ? []
      : [
          {
            href: clzPath(`/${CLZ_ZONE_PAGE.slug}`),
            label: "Zone d'intervention",
            sub: `${TRAVEL.includedKmOneWay} km inclus depuis Choisy`,
          },
        ]),
  ]
  return (
    <section className="bg-[var(--clz-surface-2)]">
      <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-16">
        <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Nos autres prestations à domicile</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {items.map((s) => (
            <Link key={s.href} href={s.href} className="clz-card group flex items-center justify-between gap-4 p-5">
              <span>
                <span className="block font-semibold text-[var(--clz-fg)]">{s.label}</span>
                <span className="text-sm text-[var(--clz-muted)]">{s.sub}</span>
              </span>
              <ArrowRight className="h-5 w-5 flex-none text-[var(--clz-blue)] transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function Faq({ title, entries }: { title: string; entries: ClzFaq[] }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
      <h2 className="clz-display clz-h2 text-center text-[var(--clz-fg)]">{title}</h2>
      <div className="mt-10">
        <CleanyzerFaq entries={entries} />
      </div>
    </section>
  )
}

function KeyFacts() {
  return (
    <div className="mt-6 flex flex-wrap gap-3 text-sm">
      <span className="flex items-center gap-2 rounded-full border border-[var(--clz-line)] px-4 py-2 text-[var(--clz-fg)]">
        <MapPin className="h-4 w-4 text-[var(--clz-blue)]" /> À domicile · {TRAVEL.includedKmOneWay} km inclus
      </span>
      <span className="flex items-center gap-2 rounded-full border border-[var(--clz-line)] px-4 py-2 text-[var(--clz-fg)]">
        <Clock className="h-4 w-4 text-[var(--clz-blue)]" /> {TRAVEL.daysLabel}, {TRAVEL.hoursLabel}
      </span>
    </div>
  )
}

function ZoneJourney({ kind, slug }: { kind: "interieur" | "exterieur"; slug: string }) {
  const zones = zonesForSide(kind === "interieur" ? "int" : "ext")
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
      <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Zone par zone, en vidéo et en 3D</h2>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {zones.map((k) => (
          <li key={k} className="clz-card flex flex-col gap-3 p-5">
            <h3 className="font-semibold text-[var(--clz-fg)]">{JOURNEY_ZONES[k].title}</h3>
            <Link className="text-sm font-semibold text-[var(--clz-blue)] hover:underline" href={filmDeepLink(JOURNEY_ZONES[k].film, slug)}>
              ▶ Voir en vidéo
            </Link>
            <Link className="text-sm font-semibold text-[var(--clz-blue)] hover:underline" href={visitDeepLink(k, slug)}>
              Voir la zone sur la Porsche 3D
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Page prestation                                                            */
/* -------------------------------------------------------------------------- */

export function CleanyzerServicePage({ page, contact }: { page: ClzServicePage; contact?: ClzContact | null }) {
  const path = `/prestations/${page.slug}`
  // FAQPage = réponse directe (affichée en tête) + FAQ affichée plus bas.
  const faq = [page.answer, ...page.faq]
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Accueil", url: clzCanonical("/") },
    { name: page.label, url: clzCanonical(path) },
  ])
  const service = buildServiceJsonLd({
    name: page.serviceName,
    description: page.metaDescription,
    url: clzCanonical(path),
    serviceType: page.serviceType,
    provider: { name: BRAND.name, url: clzCanonical("/") },
    areaServed: CLZ_AREA_SERVED,
    image: `${ASSET_ORIGIN}${page.image}`,
    offers: clzServiceOffers(page),
  })

  const pairs = PAIRS.filter((p) => p.kind === page.kind)

  return (
    <CleanyzerShell navItems={CLZ_SITE_NAV_ITEMS} active="Prestations" contact={contact}>
      <JsonLd data={service} />
      <JsonLd data={breadcrumb} />
      <JsonLd data={faqJsonLd(faq)} />

      <PageHero
        eyebrow={page.eyebrow}
        title={page.h1}
        intro={page.intro}
        homeHref={CLZ_HOME_HREF}
        crumbs={[{ label: "Prestations", href: `${CLZ_HOME_HREF}#prestations` }, { label: page.label }]}
      />

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <DirectAnswer question={page.answer.q} answer={page.answer.a} />
            <KeyFacts />
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {/* Textile (canapé, matelas, tapis, moquette) : TOUJOURS la demande
                  personnalisée. Automobile : réservation en ligne (BookingV2). */}
              {page.kind === "textile" ? (
                <Link href={CLZ_DEMANDE_HREF} className="clz-btn clz-btn-primary">
                  Demander un devis textile
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Link href={CLZ_BOOKING_HREF} className="clz-btn clz-btn-primary">
                  Réserver en ligne
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
          <div className="clz-card relative aspect-[4/5] overflow-hidden">
            <Image
              src={page.image}
              alt={page.imageAlt}
              fill
              priority
              sizes="(max-width:1024px) 100vw, 40vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {page.kind === "textile" ? <TextileBody /> : <AutoBody kind={page.kind} />}
      {page.kind !== "textile" && <ZoneJourney kind={page.kind} slug={page.slug} />}

      {pairs.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
          <span className="clz-eyebrow">Avant / après</span>
          <h2 className="clz-display clz-h2 mt-3 text-[var(--clz-fg)]">
            Des résultats <span className="clz-accent">qui se voient</span>
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {pairs.map((p) => (
              <article key={p.before} className="grid gap-2.5">
                <div className="clz-pair-duo">
                  <figure>
                    <span className="clz-pair-label">Avant</span>
                    <Image src={`/custom-sites/cleanyzer/realisations/${p.before}.webp`} alt={p.altBefore} fill loading="lazy" sizes="(max-width:768px) 50vw, 17vw" className="object-cover" />
                  </figure>
                  <figure>
                    <span className="clz-pair-label is-after">Après</span>
                    <Image src={`/custom-sites/cleanyzer/realisations/${p.after}.webp`} alt={p.altAfter} fill loading="lazy" sizes="(max-width:768px) 50vw, 17vw" className="object-cover" />
                  </figure>
                </div>
                <h3 className="mt-1 font-semibold text-[var(--clz-fg)]">{p.title}</h3>
                <p className="text-sm text-[var(--clz-muted)]">{p.detail}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <Faq title={`Questions fréquentes — ${page.label.toLowerCase()}`} entries={page.faq} />
      <Related current={page.slug} />
      <CrossCta textile={page.kind === "textile"} />
    </CleanyzerShell>
  )
}

function AutoBody({ kind }: { kind: "interieur" | "exterieur" }) {
  const label = kind === "interieur" ? "intérieur" : "extérieur"
  return (
    <>
      <section className="bg-[var(--clz-surface-2)]">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
          <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Formules de nettoyage {label} et tarifs</h2>
          <p className="mt-3 max-w-2xl text-[var(--clz-muted)]">
            Prix par type de véhicule : citadine, berline ou SUV. Le total, déplacement compris,
            s&apos;affiche avant validation.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {formulasFor(kind).map((f) => (
              <FormulaCard key={f.key} f={f} reserveHref={CLZ_BOOKING_HREF} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Options {label}</h2>
        <p className="mt-3 max-w-2xl text-[var(--clz-muted)]">Options disponibles en complément d&apos;une formule, selon le barème CLEANYZER.</p>
        <ul className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {optionsFor(kind).map((o) => (
            <li key={o.key} className="flex items-start justify-between gap-4 border-b border-[var(--clz-line)] py-3">
              <span className="flex items-start gap-2.5 text-[var(--clz-fg)]">
                <span className="clz-check mt-0.5 h-5 w-5"><Check className="h-3 w-3" /></span>
                <span>
                  {o.label}
                  {o.note && <span className="block text-xs text-[var(--clz-muted)]">{o.note}</span>}
                </span>
              </span>
              <span className="max-w-[11rem] shrink-0 text-right font-semibold text-[var(--clz-fg)]">{o.priceLabel ?? `${o.price} €`}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function TextileBody() {
  return (
    <section className="bg-[var(--clz-surface-2)]">
      <div className="mx-auto max-w-3xl px-4 py-14 md:px-6 md:py-20">
        <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Tarifs du nettoyage textile</h2>
        <div className="clz-card mt-8 overflow-hidden bg-[var(--clz-surface)]">
          <div className="border-b border-[var(--clz-line)] p-5">
            <p className="text-sm font-semibold text-[var(--clz-fg)]">Inclus dans chaque prestation</p>
            <p className="mt-1 text-sm text-[var(--clz-muted)]">{TEXTILE_BASE}</p>
          </div>
          <ul>
            {TEXTILE_ITEMS.map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-4 border-b border-[var(--clz-line)] px-5 py-4 last:border-0">
                <span className="text-[var(--clz-fg)]">
                  {t.label}
                  {t.hint && <span className="block text-xs text-[var(--clz-muted)]">{t.hint}</span>}
                </span>
                <span className="whitespace-nowrap font-semibold text-[var(--clz-fg)]">{t.priceLabel}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {TEXTILE_SUPPLEMENTS.map((s) => (
            <span key={s.label} className="rounded-full border border-[var(--clz-line)] px-3 py-1.5 text-sm text-[var(--clz-fg)]">
              {s.label} <span className="text-[var(--clz-blue)]">{s.priceLabel}</span>
            </span>
          ))}
        </div>
        <Link href={CLZ_DEMANDE_HREF} className="clz-btn clz-btn-primary mt-8">
          Faire une demande personnalisée <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Page zone d'intervention                                                   */
/* -------------------------------------------------------------------------- */

export function CleanyzerZonePage({ contact }: { contact?: ClzContact | null }) {
  const path = `/${CLZ_ZONE_PAGE.slug}`
  // FAQPage = réponse directe (affichée en tête) + FAQ affichée plus bas.
  const faq = [CLZ_ZONE_PAGE.answer, ...CLZ_ZONE_PAGE.faq]
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Accueil", url: clzCanonical("/") },
    { name: CLZ_ZONE_PAGE.label, url: clzCanonical(path) },
  ])

  return (
    <CleanyzerShell navItems={CLZ_SITE_NAV_ITEMS} active="Zone d'intervention" contact={contact}>
      <JsonLd data={breadcrumb} />
      <JsonLd data={faqJsonLd(faq)} />

      <PageHero
        eyebrow={CLZ_ZONE_PAGE.eyebrow}
        title={CLZ_ZONE_PAGE.h1}
        intro={CLZ_ZONE_PAGE.intro}
        homeHref={CLZ_HOME_HREF}
        crumbs={[{ label: CLZ_ZONE_PAGE.label }]}
      />

      <section className="mx-auto max-w-3xl px-4 pt-14 md:px-6 md:pt-20">
        <DirectAnswer question={CLZ_ZONE_PAGE.answer.q} answer={CLZ_ZONE_PAGE.answer.a} />
        <KeyFacts />
      </section>

      <ZoneSection linkToZonePage={false} />

      <section className="mx-auto max-w-6xl px-4 pb-14 md:px-6 md:pb-20">
        <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Communes du secteur</h2>
        <p className="mt-3 max-w-2xl text-[var(--clz-muted)]">
          Exemples de communes où {BRAND.name} se déplace pour le nettoyage de voiture et de textile à domicile.
          Le montant exact du déplacement est calculé à partir de votre adresse.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ZONE_SECTORS.map((sector) => {
            const names = ZONE_COMMUNES.filter((c) => c.sector === sector.id).map((c) => c.name)
            if (!names.length) return null
            return (
              <div key={sector.id} className="clz-card p-5">
                <h3 className="font-semibold text-[var(--clz-fg)]">{sector.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--clz-muted)]">{joinNames(names)}</p>
              </div>
            )
          })}
        </div>
      </section>

      <Faq title="Questions fréquentes — zone d'intervention" entries={CLZ_ZONE_PAGE.faq} />
      <Related current={CLZ_ZONE_PAGE.slug} />
      <CrossCta />
    </CleanyzerShell>
  )
}
