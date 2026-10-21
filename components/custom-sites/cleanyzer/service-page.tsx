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
import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildServiceJsonLd,
  LOCAL_BUSINESS_ID_FRAGMENT,
} from "@/lib/seo/structured-data"
import { tenantCanonicalHost, tenantCanonicalPathPrefix } from "@/lib/tenant-shared"
import { CleanyzerShell, type ClzContact } from "./site-shell"
import { PageHero, DirectAnswer } from "./page-primitives"
import { CleanyzerFaq } from "./faq"
import { CLZ_SITE_NAV_ITEMS } from "./nav"
import { FormulaCard, CrossCta } from "./prestations"
import { ClzPairCard, PAIRS } from "./realisations-tom"
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
  CLZ_OPTIQUES_PRICE,
  CLZ_PRICES,
  CLZ_SERVICE_PAGES,
  CLZ_ZONE_PAGE,
  type ClzFaq,
  type ClzServicePage,
} from "./seo-content"
import { CLEANYZER_TENANT_SLUG, CLZ_BOOKING_HREF, CLZ_DEMANDE_HREF, CLZ_HOME_HREF, clzBookingHref, clzPath } from "./tokens"
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
  // Optiques : option d'un lavage extérieur, non réservable seule → pas d'Offer autonome.
  if (page.kind === "optiques") return []
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
      label: p.linkLabel ?? p.h1.replace(/ à domicile à Annecy$/, ""),
      sub:
        p.kind === "interieur"
          ? `à partir de ${CLZ_PRICES.interieurMin} €`
          : p.kind === "exterieur"
            ? `à partir de ${CLZ_PRICES.exterieurMin} €`
            : p.kind === "optiques"
              ? `option à ${CLZ_OPTIQUES_PRICE} €`
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
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            {JOURNEY_ZONES[k].film ? (
              <Link className="text-sm font-semibold text-[var(--clz-blue)] hover:underline" href={filmDeepLink(JOURNEY_ZONES[k].film, slug)}>
                ▶ Voir en vidéo
              </Link>
            ) : (
              JOURNEY_ZONES[k].link && (
                <Link className="text-sm font-semibold text-[var(--clz-blue)] hover:underline" href={JOURNEY_ZONES[k].link.href}>
                  {JOURNEY_ZONES[k].link.label}
                </Link>
              )
            )}
            <Link className="text-sm font-semibold text-[var(--clz-blue)] hover:underline" href={visitDeepLink(k, slug)}>
              Voir la zone sur le véhicule 3D
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
    provider: {
      name: BRAND.name,
      url: clzCanonical("/"),
      id: `${clzCanonical("/")}${LOCAL_BUSINESS_ID_FRAGMENT}`,
    },
    areaServed: CLZ_AREA_SERVED,
    image: `${ASSET_ORIGIN}${page.image}`,
    offers: clzServiceOffers(page),
  })

  // La page optiques affiche ses paires dans son propre corps (pas de doublon).
  const pairs = page.kind === "optiques" ? [] : PAIRS.filter((p) => p.kind === page.kind)

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
              ) : page.kind === "optiques" ? (
                <>
                  <Link href={CLZ_BOOKING_HREF} className="clz-btn clz-btn-primary">
                    Réserver avec un lavage extérieur
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href={clzPath(`/prestations/${EXTERIOR_SLUG}`)} className="clz-btn">
                    Voir le lavage extérieur
                  </Link>
                </>
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

      {page.kind === "textile" ? (
        <TextileBody />
      ) : page.kind === "optiques" ? (
        <OptiquesBody />
      ) : (
        <AutoBody kind={page.kind} />
      )}
      {(page.kind === "interieur" || page.kind === "exterieur") && <ZoneJourney kind={page.kind} slug={page.slug} />}

      {pairs.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
          <span className="clz-eyebrow">Avant / après</span>
          <h2 className="clz-display clz-h2 mt-3 text-[var(--clz-fg)]">
            Des résultats <span className="clz-accent">qui se voient</span>
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {pairs.map((p) => (
              <ClzPairCard key={p.before} pair={p} />
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
              <FormulaCard key={f.key} f={f} reserveHref={clzBookingHref(kind, f.key)} />
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

const EXTERIOR_SLUG = CLZ_SERVICE_PAGES.find((p) => p.kind === "exterieur")!.slug

/** Communes citées sur la page optiques : déjà publiées sur la page zone. */
const OPTIQUES_COMMUNES = ["annecy", "seynod", "cran-gevrier", "annecy-le-vieux"]
  .map((slug) => ZONE_COMMUNES.find((c) => c.slug === slug)?.name)
  .filter((n): n is string => Boolean(n))

const OPTIQUES_BENEFITS = [
  "Atténuer le jaunissement et l'opacité de surface.",
  "Retrouver de la transparence, selon l'état des optiques.",
  "Améliorer l'apparence générale du véhicule.",
  "Contribuer à une meilleure diffusion de la lumière, lorsque l'opacité extérieure est en cause.",
  "Préparer le véhicule avant le contrôle technique.",
]

function OptiquesBody() {
  const pairs = PAIRS.filter((p) => p.service === "optiques")
  return (
    <>
      <section className="bg-[var(--clz-surface-2)]">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
          <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Pourquoi rénover ses phares ?</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OPTIQUES_BENEFITS.map((b) => (
              <li key={b} className="clz-card flex items-start gap-3 bg-[var(--clz-surface)] p-5 text-[var(--clz-fg)]">
                <span className="clz-check mt-0.5 h-5 w-5 flex-none"><Check className="h-3 w-3" /></span>
                <span className="leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 md:px-6 md:py-20">
        <h2 className="clz-display clz-h2 text-balance text-[var(--clz-fg)]">
          Des phares opaques peuvent poser problème au contrôle technique
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-[var(--clz-fg)]">
          Des optiques fortement ternis peuvent affecter la qualité de l&apos;éclairage. Selon le défaut constaté, cela
          peut entraîner une défaillance lors du contrôle technique, voire une contre-visite. La rénovation des surfaces
          extérieures peut contribuer à améliorer la transparence des phares, sans garantir la conformité de l&apos;ensemble
          du système d&apos;éclairage.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-[var(--clz-muted)]">
          Les défauts électriques, les problèmes de réglage, les fissures importantes et les dommages internes nécessitent
          un diagnostic ou une intervention adaptée.
        </p>
      </section>

      {pairs.length > 0 && (
        <section className="bg-[var(--clz-surface-2)]">
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
            <span className="clz-eyebrow">Avant / après</span>
            <h2 className="clz-display clz-h2 mt-3 text-[var(--clz-fg)]">
              Des résultats <span className="clz-accent">qui se voient</span>
            </h2>
            <p className="mt-3 max-w-2xl text-[var(--clz-muted)]">Découvrez la différence avant et après rénovation.</p>
            <div className="mt-10 grid gap-8 md:grid-cols-2">
              {pairs.map((p) => (
                <ClzPairCard key={p.before} pair={p} showLink={false} sizes="(max-width:768px) 100vw, 50vw" />
              ))}
            </div>
            <Link href={`${CLZ_HOME_HREF}#avant-apres`} className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--clz-blue)] hover:underline">
              Voir toutes les réalisations avant / après <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-3xl px-4 py-14 md:px-6 md:py-20">
        <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Tarif de la rénovation des optiques</h2>
        <div className="clz-card mt-8 flex items-center justify-between gap-4 p-5">
          <span className="text-[var(--clz-fg)]">
            Rénovation des optiques de phares
            <span className="block text-sm text-[var(--clz-muted)]">Option d&apos;une formule de lavage extérieur</span>
          </span>
          <span className="whitespace-nowrap text-lg font-semibold text-[var(--clz-fg)]">{CLZ_OPTIQUES_PRICE} €</span>
        </div>
        <p className="mt-4 leading-relaxed text-[var(--clz-muted)]">
          La rénovation s&apos;ajoute à une formule de{" "}
          <Link href={clzPath(`/prestations/${EXTERIOR_SLUG}`)} className="font-semibold text-[var(--clz-blue)] hover:underline">
            lavage extérieur
          </Link>{" "}
          lors de la réservation en ligne. Le total, déplacement compris, s&apos;affiche avant validation.
        </p>
        <h3 className="mt-10 font-semibold text-[var(--clz-fg)]">Une intervention à domicile</h3>
        <p className="mt-2 leading-relaxed text-[var(--clz-muted)]">
          Tom se déplace chez vous, par exemple à {joinNames(OPTIQUES_COMMUNES)}. Le détail des communes et des
          conditions de déplacement figure sur la page{" "}
          <Link href={clzPath(`/${CLZ_ZONE_PAGE.slug}`)} className="font-semibold text-[var(--clz-blue)] hover:underline">
            Zone d&apos;intervention
          </Link>
          .
        </p>
        <Link href={CLZ_BOOKING_HREF} className="clz-btn clz-btn-primary mt-8">
          Réserver un lavage extérieur <ArrowRight className="h-4 w-4" />
        </Link>
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
