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
import { Star } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { SpiritSentences } from "./spirit-sentences"
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
  /**
   * Note GLOBALE Google RÉELLE (agrégée par Google), ou null si indisponible /
   * aucun établissement configuré → la note est alors masquée (rien inventé).
   */
  googleRating?: number | null
  /** Lien vers la fiche Google (rend la note cliquable). */
  googleUrl?: string | null
}

const DEFAULTS = {
  title: "Prenez soin de votre véhicule",
  subtitle:
  "Nettoyage, polissage, protection céramique :\nun detailing réalisé avec exigence. Demandez votre devis personnalisé en quelques instants.",
}

export function SpiritHero({
  title,
  highlight,
  subtitle,
  quoteEnabled,
  hasGallery,
  city,
  googleRating,
  googleUrl,
}: SpiritHeroProps) {
  const displayCity = (city ?? "").trim() || null
  // Note Google réelle formatée à la française (« 5,0 »). Affichée uniquement si
  // une vraie note agrégée est fournie ; sinon la note est masquée.
  const hasRating = typeof googleRating === "number" && Number.isFinite(googleRating)
  const ratingLabel = hasRating
    ? googleRating.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : null
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
      className="relative flex min-h-[100svh] items-end overflow-hidden bg-[var(--spirit-navy)] pt-[72px] sm:items-center lg:min-h-[600px] lg:pt-20"
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
            {/* Une phrase par ligne (présentation) : le texte — défaut du code
                ou `heroSubtitle` saisi dans l'admin — n'est jamais réécrit. */}
            <SpiritSentences
              text={displaySubtitle}
              className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-[color:var(--spirit-muted)] sm:text-lg"
            />
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

          {/* Présentation Google COMPACTE, sous les boutons et alignée à gauche
              sur leur bord (même conteneur max-w-xl). La note est la vraie note
              agrégée Google (masquée si indisponible, jamais recalculée ni mise
              en dur) et renvoie vers la fiche Google (attribution). Les mentions
              de service sont des descripteurs éditoriaux neutres (même classe
              que le bandeau de réassurance), sans chiffre ni label. */}
          <Reveal delay={0.32}>
            {/* UNE SEULE LIGNE garantie, y compris sur petit mobile :
                - flex-nowrap + whitespace-nowrap → aucun retour à la ligne ;
                - taille FLUIDE (clamp) → le texte rétrécit sur les petits écrans
                  au lieu de déborder ou d'être tronqué (jamais de « … ») ;
                - le hero a overflow-hidden : aucun défilement horizontal induit. */}
            <div className="mt-6 flex flex-nowrap items-center gap-x-1.5 whitespace-nowrap text-[clamp(9px,2.9vw,0.875rem)] leading-tight text-[color:var(--spirit-muted)] sm:gap-x-2.5">
              {ratingLabel &&
                (googleUrl ? (
                  <a
                    href={googleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Note ${ratingLabel} sur 5 sur Google — voir la fiche`}
                    className="inline-flex items-center gap-1 transition-colors hover:text-white sm:gap-1.5"
                  >
                    <span className="font-semibold text-white">{ratingLabel}</span>
                    <Star className="size-3.5 shrink-0 fill-[var(--spirit-pink)] text-[var(--spirit-pink)] sm:size-4" aria-hidden="true" />
                    <span>sur Google</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 sm:gap-1.5">
                    <span className="font-semibold text-white">{ratingLabel}</span>
                    <Star className="size-3.5 shrink-0 fill-[var(--spirit-pink)] text-[var(--spirit-pink)] sm:size-4" aria-hidden="true" />
                    <span>sur Google</span>
                  </span>
                ))}
              {ratingLabel && <span aria-hidden="true" className="text-[color:var(--spirit-muted)]/50">·</span>}
              <span>Service sur mesure</span>
              <span aria-hidden="true" className="text-[color:var(--spirit-muted)]/50">·</span>
              <span>Atelier &amp; domicile</span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
