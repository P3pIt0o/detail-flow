/**
 * Section « Réalisations » — VRAIES photos Rozan.
 *
 * On n'affiche AUCUN avant/après fabriqué : tant que Rozan ne fournit pas de
 * vrais couples avant/après, on montre des réalisations authentiques (mosaïque
 * premium). Le comparateur `RozanCompare` reste dans le code pour brancher de
 * vrais couples le jour où ils seront fournis, sans réécrire cette section.
 *
 * Fond sombre pour faire ressortir les visuels (contraste detailing premium).
 */

import Image from "next/image"
import Link from "next/link"
import { ROZAN_SECTIONS } from "./tokens"
import { ROZAN_GALLERY } from "./content"

const RATIO: Record<NonNullable<(typeof ROZAN_GALLERY)[number]["span"]>, string> = {
  tall: "aspect-[3/4]",
  wide: "aspect-[16/10]",
  normal: "aspect-[4/3]",
}

export function RozanAvantApres() {
  return (
    <section id={ROZAN_SECTIONS.realisations} className="bg-[var(--rozan-ink)] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <span className="rozan-rule" />
          <h2 className="rozan-title rozan-h2 mt-4 text-balance text-white">
            Nos réalisations récentes.
          </h2>
          <p className="mt-3 text-pretty text-white/65">
            Des interventions réelles, réalisées directement chez nos clients dans le Pays de Gex
            et à Genève. Voitures, intérieurs, jantes et carrosseries.
          </p>
        </div>

        <div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3 [column-fill:_balance]">
          {ROZAN_GALLERY.map((it, i) => (
            <figure
              key={it.id}
              className="group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-white/10"
            >
              <div className={`relative w-full ${RATIO[it.span ?? "normal"]}`}>
                <Image
                  src={it.src || "/placeholder.svg"}
                  alt={it.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  loading={i < 2 ? "eager" : "lazy"}
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />
              </div>
              <figcaption className="absolute inset-x-0 bottom-0 translate-y-1 p-4 text-sm font-medium text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                {it.caption}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/reservation"
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--rozan-accent)] px-8 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)]"
          >
            Réserver ma prestation
          </Link>
        </div>
      </div>
    </section>
  )
}
