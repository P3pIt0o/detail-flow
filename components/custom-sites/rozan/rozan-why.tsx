/**
 * Section « Pourquoi Rozan ? » — 4 arguments maximum, très visuels, sans pavés.
 * Fond clair, mise en avant de l'argument différenciant (autonomie eau/élec).
 */

import { Truck, Droplets, Wrench, Star } from "lucide-react"
import { ROZAN_WHY } from "./content"
import { ROZAN_SECTIONS } from "./tokens"

const ICONS = [Truck, Droplets, Wrench, Star] as const

export function RozanWhy() {
  return (
    <section id={ROZAN_SECTIONS.pourquoi} className="bg-[var(--rozan-surface-2)] py-20 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="rozan-rule" aria-hidden="true" />
          <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">Pourquoi choisir Rozan ?</h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {ROZAN_WHY.map((item, i) => {
            const Icon = ICONS[i] ?? Star
            return (
              <div key={item.title} className="flex flex-col">
                <span className="flex size-12 items-center justify-center rounded-full bg-[var(--rozan-accent-soft)] text-[var(--rozan-accent)]">
                  <Icon className="size-5" strokeWidth={2} aria-hidden="true" />
                </span>
                <h3 className="rozan-title mt-5 text-lg text-[var(--rozan-fg)]">{item.title}</h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--rozan-muted)]">{item.text}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
