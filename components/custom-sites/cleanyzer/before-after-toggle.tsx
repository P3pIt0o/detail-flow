"use client"

/**
 * Avant / Après CLEANYZER (ISUZU). Les deux photos n'ont pas le même cadrage :
 * plutôt qu'une superposition trompeuse, deux visuels identifiés avec fondu.
 * Utilisable au doigt, à la souris et au clavier (boutons radio-like).
 */

import { useState } from "react"
import Image from "next/image"

type Shot = { src: string; alt: string }

export function CleanyzerBeforeAfter({ before, after }: { before: Shot; after: Shot }) {
  const [showAfter, setShowAfter] = useState(false)
  const shots = [
    { key: "avant", label: "Avant", shot: before, active: !showAfter },
    { key: "apres", label: "Après", shot: after, active: showAfter },
  ]

  return (
    <figure className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setShowAfter((v) => !v)}
        className="relative block aspect-[4/5] w-full overflow-hidden rounded-2xl border border-white/10 bg-[var(--clz-ink)]"
        aria-label={showAfter ? "Afficher la photo avant nettoyage" : "Afficher la photo après nettoyage"}
      >
        {shots.map((s) => (
          <Image
            key={s.key}
            src={s.shot.src || "/placeholder.svg"}
            alt={s.shot.alt}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            loading="lazy"
            aria-hidden={!s.active}
            className={`object-cover object-center transition-opacity duration-500 ease-out motion-reduce:transition-none ${
              s.active ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
        <span className="absolute left-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur">
          {showAfter ? "Après" : "Avant"}
        </span>
      </button>

      <div role="group" aria-label="Choisir la photo" className="inline-flex self-start rounded-full border border-white/15 bg-black/30 p-1">
        {shots.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={s.active}
            onClick={() => setShowAfter(s.key === "apres")}
            className={`min-h-11 rounded-full px-5 text-sm font-semibold transition-colors ${
              s.active ? "bg-[var(--clz-blue)] text-white" : "text-white/75 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <figcaption className="text-xs leading-relaxed text-[var(--clz-on-dark-muted)]">
        ISUZU — habitacle avant et après intervention. Photos prises sous des angles proches mais non identiques.
      </figcaption>
    </figure>
  )
}
