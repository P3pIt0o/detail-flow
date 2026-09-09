/**
 * Template de LANDING PAGE LOCALE (ex. « Nettoyage de canapé à Genève »).
 *
 * Doit ressembler à une vraie landing commerciale premium, PAS à une page
 * fabriquée pour Google : contenu réellement pertinent pour la ville, sans
 * keyword stuffing. Un seul H1 (« <prestation> à <ville> »).
 *
 * Structure : hero local → preuve → avant/après → service → intervention à
 * domicile → fonctionnement → réalisations → avis → zones proches → FAQ → devis.
 *
 * PHASE 2 : contenu de démonstration. En Phase 4, chaque page locale aura un
 * contenu éditorial propre (jamais un simple remplacement de nom de ville) et
 * ses métadonnées SEO dédiées (title, description, canonical, JSON-LD).
 */

import Link from "next/link"
import { ChevronRight, MapPin, Truck, Droplets, Clock, Check } from "lucide-react"
import { RozanSiteShell } from "./site-shell"
import { RozanAvantApres } from "./rozan-avant-apres"
import { RozanProcess } from "./rozan-process"
import { RozanAvis } from "./rozan-avis"
import { RozanDevis } from "./rozan-devis"
import { RozanFaq } from "./rozan-faq"
import { RozanShot } from "./rozan-shot"
import { RozanGoogleProof } from "./rozan-google-proof"
import { ROZAN_SECTIONS, type RozanNavItem } from "./tokens"
import { ROZAN_BRAND, ROZAN_GOOGLE, ROZAN_SERVICES, type RozanServiceSlug } from "./content"

const SUBPAGE_NAV: RozanNavItem[] = [
  { id: "p", label: "Prestations", route: `/#${ROZAN_SECTIONS.prestations}` },
  { id: "a", label: "Avant / Après", route: `/#${ROZAN_SECTIONS.avantApres}` },
  { id: "z", label: "Zones d'intervention", route: `/#${ROZAN_SECTIONS.zones}` },
  { id: "v", label: "Avis", route: `/#${ROZAN_SECTIONS.avis}` },
  { id: "f", label: "FAQ", route: `/#${ROZAN_SECTIONS.faq}` },
]

export function RozanLocalPage({
  slug,
  city,
  nearbyCities = [],
}: {
  slug: RozanServiceSlug
  city: string
  nearbyCities?: string[]
}) {
  const service = ROZAN_SERVICES.find((s) => s.slug === slug) ?? ROZAN_SERVICES[1]
  const serviceLower = service.label.toLowerCase()

  return (
    <RozanSiteShell
      brandName={ROZAN_BRAND.name}
      navItems={SUBPAGE_NAV}
      ctaHref={`#${ROZAN_SECTIONS.devis}`}
      ctaLabel="Obtenir mon devis"
      phoneRaw={ROZAN_BRAND.phoneRaw}
      phoneLabel={ROZAN_BRAND.phone}
      stickyCtaHref={`#${ROZAN_SECTIONS.devis}`}
      stickyCtaLabel="Obtenir mon devis"
    >
      {/* Fil d'Ariane */}
      <div className="bg-[var(--rozan-bg)]">
        <nav aria-label="Fil d'Ariane" className="mx-auto flex w-full max-w-7xl items-center gap-1.5 px-4 pt-6 text-sm text-[var(--rozan-muted)] sm:px-6 lg:px-8">
          <Link href="/" className="transition-colors hover:text-[var(--rozan-accent)]">Accueil</Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <Link href={`/prestations/${service.slug}`} className="transition-colors hover:text-[var(--rozan-accent)]">{service.label}</Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span className="text-[var(--rozan-fg)]">{city}</span>
        </nav>
      </div>

      {/* Hero local */}
      <section className="bg-[var(--rozan-bg)]">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:px-8 lg:py-16">
          <div>
            <p className="rozan-eyebrow inline-flex items-center gap-2">
              <MapPin className="size-3.5" aria-hidden="true" />
              {city}
            </p>
            <h1 className="rozan-title rozan-h1 mt-4 text-balance text-[var(--rozan-fg)]">
              {service.label} à <span className="text-[var(--rozan-accent)]">{city}</span>
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-[var(--rozan-muted)] sm:text-lg">
              Rozan intervient directement à {city} pour le nettoyage de {serviceLower}, entièrement
              autonome en eau et en électricité. Vous ne vous déplacez pas : nous venons à vous.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={`#${ROZAN_SECTIONS.devis}`}
                className="inline-flex h-13 items-center justify-center rounded-full bg-[var(--rozan-accent)] px-8 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)]"
              >
                Obtenir mon devis à {city}
              </a>
              <RozanGoogleProof rating={ROZAN_GOOGLE.rating} count={ROZAN_GOOGLE.count} href={ROZAN_GOOGLE.url} />
            </div>
          </div>
          <RozanShot label={`${service.shot} — ${city}`} ratio="aspect-[4/3]" rounded="rounded-3xl" />
        </div>
      </section>

      <RozanAvantApres />

      {/* Le service à {ville} + intervention à domicile */}
      <section className="bg-[var(--rozan-surface)]">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-20">
          <div>
            <span className="rozan-rule" />
            <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">
              Le nettoyage de {serviceLower} à {city}
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-[var(--rozan-muted)]">
              À {city} comme dans tout le secteur, nous nous déplaçons avec un équipement professionnel
              complet. Grâce à notre autonomie en eau et en électricité, aucune contrainte pour vous :
              nous intervenons en bas de chez vous, sur votre parking ou dans votre garage.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { icon: Truck, text: `Déplacement inclus à ${city} et alentours` },
                { icon: Droplets, text: "Autonomes en eau et électricité" },
                { icon: Clock, text: "Créneaux flexibles, intervention soignée" },
              ].map((it) => (
                <li key={it.text} className="flex items-center gap-3 text-sm text-[var(--rozan-fg)]">
                  <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-[var(--rozan-accent-soft)] text-[var(--rozan-accent)]">
                    <it.icon className="size-4" aria-hidden="true" />
                  </span>
                  {it.text}
                </li>
              ))}
            </ul>
          </div>
          <RozanShot label={`Intervention à domicile à ${city}`} ratio="aspect-[4/3]" rounded="rounded-3xl" />
        </div>
      </section>

      <RozanProcess />

      {/* Réalisations locales */}
      <section className="bg-[var(--rozan-surface)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <span className="rozan-rule" />
            <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">Nos réalisations à {city}</h2>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <RozanShot key={i} label={`${service.shot} — ${city} ${i + 1}`} ratio="aspect-square" />
            ))}
          </div>
        </div>
      </section>

      <RozanAvis />

      {/* Zones proches (maillage interne) */}
      {nearbyCities.length > 0 && (
        <section className="bg-[var(--rozan-bg)]">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="max-w-2xl">
              <span className="rozan-rule" />
              <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">Nous intervenons aussi près de {city}</h2>
            </div>
            <ul className="mt-6 flex flex-wrap gap-2">
              {nearbyCities.map((c) => {
                const cslug = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
                return (
                  <li key={c}>
                    <Link
                      href={`/${service.slug.replace("nettoyage-", "nettoyage-")}-${cslug}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] px-4 py-2 text-sm text-[var(--rozan-fg)] transition-colors hover:border-[var(--rozan-accent)] hover:text-[var(--rozan-accent)]"
                    >
                      <Check className="size-3.5 text-[var(--rozan-accent)]" aria-hidden="true" />
                      {service.label} à {c}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      <RozanFaq />
      <RozanDevis />
    </RozanSiteShell>
  )
}
