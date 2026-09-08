/**
 * Hero sombre automobile de Spirit ACS — composition PREMIUM fidèle à la
 * maquette validée.
 *
 * Image de fond : VRAIE photo de la Porsche 911 de l'atelier (avec le totem
 * Spirit), cadrée pour que la voiture reste l'élément visuel fort dans la partie
 * haute, puis fondue dans le bleu nuit pour porter le texte et les CTA en bas.
 * Aucune image générée par IA.
 *
 * Le titre / sous-titre proviennent du CONTENU DU TENANT (Hero éditable), avec
 * un repli NEUTRE si non renseigné (aucune donnée commerciale inventée).
 *
 * CTA (ancres in-page uniquement — jamais /reservation) :
 *  - principal   : « Demander un devis » → #demande-devis (formulaire réel) ;
 *  - secondaire  : « Voir les prestations » → #prestations.
 *
 * Rangée de réassurance (4 repères neutres) intégrée au bas du hero, comme sur
 * la maquette. Libellés volontairement génériques et non factuels (aucune
 * certification, aucun chiffre, aucun label officiel).
 */

import Image from "next/image"
import { Gem, ShieldCheck, Car, MapPin } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { SpiritSentences } from "./spirit-sentences"
import { SPIRIT_ANCHOR_PRIMARY, SPIRIT_SECTIONS } from "./tokens"

type SpiritHeroProps = {
  title: string | null
  highlight: string | null
  subtitle: string | null
  /** Le CTA principal ne pointe vers #demande-devis que si le module est actif. */
  quoteEnabled: boolean
  /** Le CTA secondaire « Voir les prestations » n'apparaît que si la grille existe. */
  hasPrestations?: boolean
  /** Ville réelle du tenant, affichée en accroche (jamais l'adresse exacte). */
  city?: string | null
  /**
   * H1 précis pour le référencement local (ex. « Detailing automobile à
   * Lagny-sur-Marne »). PRIORITAIRE sur `title` pour le H1 affiché lorsqu'il est
   * fourni. La portion ville y est mise en couleur si elle y figure.
   */
  seoH1?: string | null
  /**
   * Accroche visuelle SECONDAIRE (surtitre élégant, ex. « Prenez soin de votre
   * véhicule ») affichée au-dessus du H1 quand `seoH1` est utilisé.
   */
  kicker?: string | null
  /** Conservés pour compatibilité d'appel (non affichés dans ce hero). */
  hasGallery?: boolean
  googleRating?: number | null
  googleUrl?: string | null
}

const DEFAULTS = {
  title: "Prenez soin de votre véhicule",
  subtitle: "Nettoyage, polissage et protection, réalisés avec exigence.",
}

export function SpiritHero({
  title,
  highlight,
  subtitle,
  quoteEnabled,
  hasPrestations = true,
  city,
  seoH1,
  kicker,
}: SpiritHeroProps) {
  const displayCity = (city ?? "").trim() || "Lagny-sur-Marne"
  const tenantTitle = title?.trim() || DEFAULTS.title
  const displaySubtitle = subtitle?.trim() || DEFAULTS.subtitle

  // H1 affiché : le H1 SEO local est PRIORITAIRE quand il est fourni. Sinon, on
  // conserve le titre éditable du tenant (comportement historique).
  const seo = (seoH1 ?? "").trim()
  const displayTitle = seo || tenantTitle

  const kickerText = (kicker ?? "").trim() || null
  const useSeoLayout = Boolean(seo)

  // Portion à mettre en couleur (cyan) dans le H1 : la ville pour le H1 SEO
  // local, sinon la portion « highlight » éditable.
  const h = useSeoLayout ? displayCity : title?.trim() ? (highlight ?? "").trim() : ""
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

  // Repères de réassurance neutres — repris de la maquette (icône + libellé
  // court). Le dernier s'appuie sur la VILLE réelle du tenant.
  const features = [
    { icon: Gem, label: "Résultat professionnel" },
    { icon: ShieldCheck, label: "Produits haut de gamme" },
    { icon: Car, label: "Pour tous types de véhicules" },
    { icon: MapPin, label: `${displayCity} et alentours` },
  ] as const

  return (
    <section
      id={SPIRIT_SECTIONS.accueil}
      data-spirit-anchor
      className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden bg-[var(--spirit-navy)] pt-[72px] lg:min-h-[640px]"
    >
      {/* Photo RÉELLE de la Porsche 911 de l'atelier — élément visuel fort.
          Traitement cinéma (contraste + saturation légers) et cadrage repris de
          la maquette validée pour révéler la voiture dans la partie haute. */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/custom-sites/spirit-acs/polissage-porsche-911.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[63%_34%] [filter:contrast(1.1)_saturate(1.07)_brightness(0.94)]"
        />
        {/* 1 · Vignettage radial : bords assombris, voiture lumineuse au centre. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 [background:radial-gradient(125%_88%_at_64%_40%,rgba(2,9,14,0)_40%,rgba(2,9,14,0.42)_78%,rgba(2,9,14,0.68)_100%)]"
        />
        {/* 2 · Voile latéral gauche : protège la lisibilité du texte. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 [background:linear-gradient(96deg,rgba(2,9,14,0.9)_0%,rgba(2,9,14,0.55)_30%,rgba(2,9,14,0.12)_58%,rgba(2,9,14,0)_78%)]"
        />
        {/* 3 · Fusion verticale : haut légèrement voilé + bas fondu dans le navy
            du site (continuité fluide vers la section prestations). */}
        <div
          aria-hidden="true"
          className="absolute inset-0 [background:linear-gradient(180deg,rgba(2,9,14,0.5)_0%,rgba(2,9,14,0)_20%,rgba(2,9,14,0)_46%,rgba(6,19,28,0.72)_80%,var(--spirit-navy)_100%)]"
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-7 sm:px-6 sm:pb-10 lg:px-8 lg:pb-12">
        <div className="max-w-xl">
          <Reveal>
            {useSeoLayout ? (
              kickerText && <p className="spirit-eyebrow">{kickerText}</p>
            ) : (
              <p className="spirit-eyebrow">
                Detailing automobile <span aria-hidden="true">·</span> {displayCity}
              </p>
            )}
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="spirit-title spirit-h1 mt-3 text-balance leading-[1.02] text-white">{titleNode}</h1>
          </Reveal>
          <Reveal delay={0.16}>
            <SpiritSentences
              text={displaySubtitle}
              className="mt-4 max-w-md text-pretty text-base leading-relaxed text-[color:var(--spirit-muted)] sm:text-lg"
            />
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-7 flex flex-col gap-3 sm:max-w-md">
              {quoteEnabled && (
                <a href={`#${SPIRIT_SECTIONS.demandeDevis}`} className={`${SPIRIT_ANCHOR_PRIMARY} w-full`}>
                  Demander un devis
                </a>
              )}
              {hasPrestations && (
                <a
                  href={`#${SPIRIT_SECTIONS.prestations}`}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-sm border border-[var(--spirit-teal)]/70 px-7 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:border-[var(--spirit-teal)] hover:bg-[var(--spirit-teal)]/10"
                >
                  Voir les prestations
                  <span aria-hidden="true">→</span>
                </a>
              )}
            </div>
          </Reveal>
        </div>

        {/* Rangée de réassurance (4 repères) intégrée au hero — comme la maquette.
            Séparateurs verticaux fins, icônes cyan, libellés courts sur 2 lignes. */}
        <Reveal delay={0.32}>
          <ul className="mt-8 grid grid-cols-4 divide-x divide-white/15 border-t border-white/15 pt-5">
            {features.map((f) => (
              <li key={f.label} className="flex flex-col items-center gap-2 px-1 text-center">
                <f.icon className="size-5 text-[var(--spirit-teal)] sm:size-6" strokeWidth={1.5} aria-hidden="true" />
                <span className="text-balance text-[clamp(0.625rem,2.6vw,0.8125rem)] leading-tight text-white/85">
                  {f.label}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
