/**
 * Hero sombre automobile de Spirit ACS.
 *
 * Le titre / sous-titre proviennent du CONTENU DU TENANT (Hero éditable), avec
 * un repli NEUTRE si non renseigné (aucune donnée commerciale inventée). CTA
 * principal vers la vraie route /reservation (tenant conservé via CtaButton) ;
 * CTA secondaire vers l'ancre des prestations (défilement fluide).
 *
 * Image de fond : asset réel du dépôt (`/hero.png`), chargé en priorité et
 * dimensionné (fill) pour éviter tout décalage de mise en page (CLS).
 */

import Image from "next/image"
import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_BTN_PRIMARY, SPIRIT_SECTIONS } from "./tokens"

type SpiritHeroProps = {
  title: string | null
  highlight: string | null
  subtitle: string | null
  ctaPrimary: string | null
  ctaSecondary: string | null
  hasServices: boolean
}

const DEFAULTS = {
  title: "Prenez soin de votre véhicule",
  subtitle:
    "Nettoyage, polissage, protection : un detailing réalisé avec exigence. Réservez votre créneau en ligne en quelques instants.",
  ctaPrimary: "Réserver en ligne",
  ctaSecondary: "Découvrir nos prestations",
}

export function SpiritHero({ title, highlight, subtitle, ctaPrimary, ctaSecondary, hasServices }: SpiritHeroProps) {
  const displayTitle = title?.trim() || DEFAULTS.title
  const h = title?.trim() ? (highlight ?? "").trim() : ""
  const displaySubtitle = subtitle?.trim() || DEFAULTS.subtitle
  const primaryLabel = ctaPrimary?.trim() || DEFAULTS.ctaPrimary
  const secondaryLabel = ctaSecondary?.trim() || DEFAULTS.ctaSecondary

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
    <section className="relative flex min-h-[540px] items-center overflow-hidden bg-[var(--spirit-navy)] lg:min-h-[600px]">
      <div className="absolute inset-0 -z-10">
        <Image src="/hero.png" alt="" fill priority sizes="100vw" className="object-cover object-center" />
        {/* Assombrissement maîtrisé : plus dense à gauche pour le texte, base sombre pour la transition. */}
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--spirit-navy)] via-[var(--spirit-navy)]/80 to-[var(--spirit-navy)]/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--spirit-navy)] via-transparent to-[var(--spirit-navy)]/30" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-xl">
          <Reveal>
            <p className="spirit-eyebrow">Detailing automobile</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="spirit-title mt-4 text-balance text-4xl text-white sm:text-5xl lg:text-6xl">{titleNode}</h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-[color:var(--spirit-muted)] sm:text-lg">
              {displaySubtitle}
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CtaButton href="/reservation" className={SPIRIT_BTN_PRIMARY}>
                {primaryLabel}
              </CtaButton>
              {hasServices && (
                <a
                  href={`#${SPIRIT_SECTIONS.prestations}`}
                  className="inline-flex h-12 items-center justify-center rounded-sm border border-white/35 px-7 text-sm font-medium text-white transition-colors hover:border-[var(--spirit-teal)] hover:text-[var(--spirit-teal)]"
                >
                  {secondaryLabel}
                </a>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
