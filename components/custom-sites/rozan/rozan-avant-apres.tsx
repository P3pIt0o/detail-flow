/**
 * Section Avant / Après — « Les résultats parlent d'eux-mêmes. »
 *
 * Comparateurs premium extrêmement fluides (voir `RozanCompare`). En Phase 2,
 * les deux faces utilisent des emplacements photo `RozanShot` (Avant / Après)
 * pour démontrer l'interaction ; en Phase 4, on y branche les vraies
 * réalisations Rozan (remplacement du contenu du comparateur uniquement).
 *
 * Fond sombre pour faire ressortir les visuels (contraste premium).
 */

import { RozanCompare } from "./rozan-compare"
import { RozanShot } from "./rozan-shot"
import { ROZAN_SECTIONS } from "./tokens"
import { ROZAN_BEFORE_AFTER } from "./content"

export function RozanAvantApres() {
  const items = ROZAN_BEFORE_AFTER.slice(0, 3)

  return (
    <section id={ROZAN_SECTIONS.avantApres} className="bg-[var(--rozan-ink)] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <span className="rozan-rule" />
          <h2 className="rozan-title rozan-h2 mt-4 text-balance text-white">
            Les résultats parlent d&apos;eux-mêmes.
          </h2>
          <p className="mt-3 text-pretty text-white/65">
            Glissez le curseur pour révéler la différence. Un nettoyage en profondeur, réalisé
            directement chez vous.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {items.map((it) => (
            <figure key={it.id} className="rozan-compare">
              <RozanCompare
                alt={it.caption}
                before={<RozanShot label={`${it.shot} — avant`} ratio="aspect-[4/3]" tone="dark" rounded="rounded-none" className="size-full border-0" />}
                after={<RozanShot label={`${it.shot} — après`} ratio="aspect-[4/3]" tone="dark" rounded="rounded-none" className="size-full border-0" />}
              />
              <figcaption className="mt-3 text-sm text-white/60">{it.caption}</figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <a
            href={`#${ROZAN_SECTIONS.devis}`}
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--rozan-accent)] px-8 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)]"
          >
            Je veux le même résultat
          </a>
        </div>
      </div>
    </section>
  )
}
