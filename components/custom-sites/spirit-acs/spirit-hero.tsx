/**
 * Hero sombre automobile de Spirit ACS.
 *
 * Le titre / sous-titre proviennent du CONTENU DU TENANT (Hero éditable), avec
 * un repli NEUTRE si non renseigné (aucune donnée commerciale inventée).
 *
 * CTA (ancres in-page uniquement — jamais /reservation) :
 *  - principal   : « Demander un devis » → #demande-devis (formulaire réel) ;
 *  - secondaire  : « Voir nos réalisations » → #realisations (si galerie).
 *
 * Image de fond : photo dédiée Spirit (spirit-hero-v2.webp), chargée en
 * priorité et dimensionnée (fill) pour éviter tout décalage de mise en page
 * (CLS). Réservée à Spirit ACS — ne remplace pas les Hero des autres tenants.
 */

import Image from "next/image"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_ANCHOR_PRIMARY, SPIRIT_SECTIONS } from "./tokens"

type SpiritHeroProps = {
  title: string | null
  highlight: string | null
  subtitle: string | null
  /** Le CTA principal ne pointe vers #demande-devis que si le module est actif. */
  quoteEnabled: boolean
  /** Le CTA secondaire n'apparaît que si une galerie de réalisations existe. */
  hasGallery: boolean
  /** Ville réelle du tenant, affichée en accroche (jamais l'adresse exacte). */
  city?: string | null
}

const DEFAULTS = {
  title: "Prenez soin de votre véhicule",
  subtitle:
    "Nettoyage, polissage, protection céramique : un detailing réalisé avec exigence. Demandez votre devis personnalisé en quelques instants.",
}

export function SpiritHero({ title, highlight, subtitle, quoteEnabled, hasGallery, city }: SpiritHeroProps) {
  const displayCity = (city ?? "").trim() || null
  const displayTitle = title?.trim() || DEFAULTS.title
  const h = title?.trim() ? (highlight ?? "").trim() : ""
  const displaySubtitle = subtitle?.trim() || DEFAULTS.subtitle

  // Met en couleur la portion « highlight » si elle est présente dans le titre.
  let titleNode: React.ReactNode = displayTitle
  if (h) {
    const idx = displayTitle.toLowerCase().indexOf(h.toLowerCase())
    if (idx !== -1) {
      titleNode = (
        <>
          {displayTitle.slice(0, idx)}
          <span className="text-[var(--spirit-teal)]">{displayTitle.slice(idx, idx + h.length)}</span>
          {displayTitle.slice(idx + h.length)}
        </>
      )
    }
  }

  return (
    <section
      id={SPIRIT_SECTIONS.accueil}
      data-spirit-anchor
      className="relative flex min-h-[560px] items-end overflow-hidden bg-[var(--spirit-navy)] pt-[72px] sm:items-center lg:min-h-[600px] lg:pt-20"
    >
      <div className="absolute inset-0 z-0">
        <Image
          src="/custom-sites/spirit-acs/spirit-hero-v2.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[72%_center] sm:object-center"
        />
        {/* MOBILE : assombrissement vertical (bas) → la photo reste visible en haut, texte lisible en bas. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--spirit-navy)] via-[var(--spirit-navy)]/60 to-[var(--spirit-navy)]/15 sm:hidden" />
        {/* DESKTOP : zone texte sombre à gauche (fondu court), voiture RÉVÉLÉE au centre-droit. */}
        <div className="absolute inset-0 hidden bg-gradient-to-r from-[var(--spirit-navy)] from-20% via-transparent via-50% to-transparent sm:block" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="max-w-xl">
          <Reveal>
            <p className="spirit-eyebrow">
              Detailing automobile
              {displayCity && (
                <>
                  {" "}
                  <span aria-hidden="true">·</span> {displayCity}
                </>
              )}
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="spirit-title spirit-h1 mt-4 text-balance leading-[1.02] text-white">{titleNode}</h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-[color:var(--spirit-muted)] sm:text-lg">
              {displaySubtitle}
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {quoteEnabled && (
                <a href={`#${SPIRIT_SECTIONS.demandeDevis}`} className={SPIRIT_ANCHOR_PRIMARY}>
                  Demander un devis
                </a>
              )}
              {hasGallery && (
                <a
                  href={`#${SPIRIT_SECTIONS.realisations}`}
                  className="inline-flex h-12 items-center justify-center rounded-sm border border-white/35 px-7 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:border-[var(--spirit-teal)] hover:text-[var(--spirit-teal)]"
                >
                  Voir nos réalisations
                </a>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
