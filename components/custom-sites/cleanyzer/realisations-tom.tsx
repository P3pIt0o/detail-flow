/**
 * Avant / après et galerie CLEANYZER — vraies photos de Tom
 * (/public/custom-sites/cleanyzer/realisations). Scopé `.cleanyzer`.
 * Prix affichés : lus dans content.ts (option rénovation des optiques) ; le siège renvoie
 * à la formule Excellence intérieur, sans chiffre ajouté.
 */

import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { EXTERIEUR_OPTIONS } from "./content"
import { ClzCompareSlider } from "./compare-slider"
import { CLZ_OPTIQUES_SLUG } from "./seo-content"
import { clzPath } from "./tokens"
import "./prestations-film.css"

const BASE = "/custom-sites/cleanyzer/realisations"

/** Prix de l'option « Rénovation optiques de phares » (barème, content.ts). */
const OPTIQUES = EXTERIEUR_OPTIONS.find((o) => o.key === "renovation-optiques")?.price

const OPTIQUES_LINK = { label: "Découvrir la rénovation des phares", href: clzPath(`/prestations/${CLZ_OPTIQUES_SLUG}`) }

export type ClzPair = {
  before: string
  after: string
  altBefore: string
  altAfter: string
  title: string
  detail: string
  kind: "interieur" | "exterieur"
  /** Prestation à page dédiée illustrée par cette paire. */
  service?: "optiques"
  link?: { label: string; href: string }
}

export const PAIRS: ClzPair[] = [
  {
    before: "phare-avant-1",
    after: "phare-apres-1",
    altBefore: "Phare avant jauni et opaque, avant rénovation",
    altAfter: "Même phare redevenu transparent après rénovation",
    title: "Rénovation des optiques de phares",
    detail: `Option extérieure · ${OPTIQUES} €`,
    kind: "exterieur",
    service: "optiques",
    link: OPTIQUES_LINK,
  },
  {
    before: "phare-avant-2",
    after: "phare-apres-2",
    altBefore: "Phare LED voilé sur une citadine noire, avant rénovation",
    altAfter: "Même phare LED transparent après rénovation, carrosserie noire brillante",
    title: "Rénovation des optiques de phares",
    detail: `Option extérieure · ${OPTIQUES} €`,
    kind: "exterieur",
    service: "optiques",
    link: OPTIQUES_LINK,
  },
  {
    before: "siege-avant",
    after: "siege-apres",
    altBefore: "Siège en tissu beige taché et moquette sale avant nettoyage",
    altAfter: "Même siège beige propre et uniforme après shampoing",
    title: "Shampoing des sièges et des tapis",
    detail: "Inclus dans la formule Excellence intérieur",
    kind: "interieur",
  },
]

export const pairSrc = (name: string) => `${BASE}/${name}.webp`

/** Carte avant / après : comparateur + titre + détail + lien éventuel (HTML natif). */
export function ClzPairCard({ pair, showLink = true, sizes }: { pair: ClzPair; showLink?: boolean; sizes?: string }) {
  return (
    <article data-clz-reveal className="grid gap-2.5">
      <ClzCompareSlider
        before={pairSrc(pair.before)}
        after={pairSrc(pair.after)}
        altBefore={pair.altBefore}
        altAfter={pair.altAfter}
        label={pair.title}
        sizes={sizes}
      />
      <h3 className="mt-1 font-semibold text-[var(--clz-fg)]">{pair.title}</h3>
      <p className="text-sm text-[var(--clz-muted)]">{pair.detail}</p>
      {showLink && pair.link && (
        <Link href={pair.link.href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--clz-blue)] hover:underline">
          {pair.link.label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </article>
  )
}

const GALLERY = [
  { src: "jante-rs6", alt: "Jante bicolore et étrier rouge d'une Audi RS6 grise", caption: "Audi RS6 · jantes" },
  { src: "gt3rs", alt: "Porsche 911 GT3 RS blanche en atelier", caption: "Porsche 911 GT3 RS" },
  { src: "interieur-911-protections", alt: "Habitacle cuir marron de Porsche 911 avec housse de volant et protection au sol", caption: "Porsche 911 Turbo S · habitacle" },
  { src: "boxster", alt: "Porsche Boxster rouge vue de trois quarts arrière", caption: "Porsche Boxster" },
  { src: "macan-gts", alt: "Porsche Macan GTS gris foncé, jantes noires et étriers rouges", caption: "Porsche Macan GTS" },
  { src: "interieur-macan", alt: "Habitacle de Porsche Macan avec housse de protection sur le volant", caption: "Porsche Macan · habitacle" },
  { src: "coffre", alt: "Coffre arrière moquetté propre d'une Porsche", caption: "Coffre" },
  { src: "aerations", alt: "Aérations rondes et écran de tableau de bord Mercedes", caption: "Aérations et tableau de bord" },
]

export function RealisationsTom() {
  return (
    <section id="avant-apres" className="scroll-mt-20 bg-[var(--clz-bg)]">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <span className="clz-eyebrow">Avant / après</span>
        <h2 className="clz-display clz-h2 mt-3 max-w-2xl text-balance text-[var(--clz-fg)]">
          Des résultats <span className="clz-accent">qui se voient</span>
        </h2>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-[var(--clz-muted)]">
          Le résultat en images.
        </p>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {PAIRS.map((p) => (
            <ClzPairCard key={p.before} pair={p} />
          ))}
        </div>

        {/* Cible du lien « Réalisations » du menu (ex-section « Le soin en images », L28). */}
        <div id="realisations" className="mt-20 scroll-mt-24">
        <span className="clz-eyebrow block">Réalisations</span>
        <h2 className="clz-display clz-h2 mt-3 max-w-2xl text-balance text-[var(--clz-fg)]">
          Passées entre <span className="clz-accent">les mains de Tom</span>
        </h2>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-[var(--clz-muted)]">
          Volant, sièges et tapis protégés pendant chaque intervention.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          {GALLERY.map((g) => (
            <figure key={g.src} data-clz-reveal className="clz-zoom relative m-0 aspect-[3/4] overflow-hidden rounded-2xl bg-[var(--clz-surface-2)]">
              <Image src={`${BASE}/${g.src}.webp`} alt={g.alt} fill loading="lazy" sizes="(max-width:768px) 50vw, 25vw" className="object-cover" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-7 text-sm text-white">
                {g.caption}
              </figcaption>
            </figure>
          ))}
        </div>
        </div>
      </div>
    </section>
  )
}
