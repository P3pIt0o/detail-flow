"use client"

/**
 * FAQ Rozan — accordéons accessibles, utiles commercialement ET sémantiquement.
 * Le balisage JSON-LD FAQPage (identique au contenu visible) sera ajouté en
 * Phase 4 au niveau de la page pour le SEO.
 */

import { useState } from "react"
import { Plus } from "lucide-react"
import { ROZAN_SECTIONS } from "./tokens"
import { ROZAN_FAQ } from "./content"

export function RozanFaq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id={ROZAN_SECTIONS.faq} className="bg-[var(--rozan-surface)]">
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="text-center">
          <span className="rozan-rule mx-auto" />
          <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">Questions fréquentes</h2>
        </div>

        <div className="mt-10 divide-y divide-[color:var(--rozan-line)] border-y border-[color:var(--rozan-line)]">
          {ROZAN_FAQ.map((item, i) => {
            const isOpen = open === i
            return (
              <div key={i}>
                <h3>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                  >
                    <span className="rozan-title text-base text-[var(--rozan-fg)] sm:text-lg">{item.q}</span>
                    <Plus
                      className={`size-5 flex-none text-[var(--rozan-accent)] transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <div
                  className={`grid transition-all duration-300 ${isOpen ? "grid-rows-[1fr] pb-5 opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                >
                  <div className="overflow-hidden">
                    <p className="text-pretty text-sm leading-relaxed text-[var(--rozan-muted)]">{item.a}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
