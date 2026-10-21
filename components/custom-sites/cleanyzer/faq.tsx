"use client"

/**
 * FAQ CLEANYZER — accordéon accessible. Réponses STRICTEMENT fondées sur le
 * cahier (tarifs §5-8, déplacement §9). Aucune donnée inventée.
 * Utilisé sur la home et sur la page /faq dédiée.
 */

import { useId, useState } from "react"
import { Plus, Minus } from "lucide-react"

// Données dans un module NON client : lisibles côté serveur (JSON-LD FAQPage).
import { CLZ_FAQ, type FaqEntry } from "./faq-content"
export type { FaqEntry }

export function CleanyzerFaq({ entries = CLZ_FAQ }: { entries?: FaqEntry[] }) {
  const [open, setOpen] = useState<number | null>(0)
  const uid = useId()
  return (
    <ul className="mx-auto max-w-3xl divide-y divide-[var(--clz-line)] border-y border-[var(--clz-line)]">
      {entries.map((item, i) => {
        const isOpen = open === i
        return (
          <li key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={`${uid}-${i}`}
              className="flex w-full items-center justify-between gap-4 py-5 text-left"
            >
              <span className="text-base font-medium text-[var(--clz-fg)] md:text-lg">{item.q}</span>
              <span className="clz-check h-7 w-7 flex-none">
                {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </span>
            </button>
            {/* Réponse TOUJOURS présente dans le HTML (masquée si repliée) : lisible
                par les moteurs et identique au balisage FAQPage. */}
            <p id={`${uid}-${i}`} hidden={!isOpen} className="max-w-2xl pb-6 text-pretty leading-relaxed text-[var(--clz-muted)]">
              {item.a}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
