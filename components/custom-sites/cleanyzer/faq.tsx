"use client"

/**
 * FAQ CLEANYZER — accordéon accessible. Réponses STRICTEMENT fondées sur le
 * cahier (tarifs §5-8, déplacement §9). Aucune donnée inventée.
 * Utilisé sur la home et sur la page /faq dédiée.
 */

import { useState } from "react"
import { Plus, Minus } from "lucide-react"

export type FaqEntry = { q: string; a: string }

// Réponses directes (utile SEO/GEO, cahier §19) — chaque chiffre vient du cahier.
export const CLZ_FAQ: FaqEntry[] = [
  {
    q: "Combien coûte un nettoyage intérieur de voiture à Annecy ?",
    a: "La formule Éco démarre à 50 € pour une citadine (60 € berline, 75 € SUV). La formule Premium débute à 80 € et l'Excellence à 115 €. La formule Diamond est entièrement sur mesure.",
  },
  {
    q: "Intervenez-vous vraiment à domicile ?",
    a: "Oui. CLEANYZER se déplace chez vous à Annecy et alentours, du lundi au dimanche, de 7 h 30 à 20 h 30.",
  },
  {
    q: "Quelle zone est couverte et y a-t-il des frais de déplacement ?",
    a: "20 km à l'aller autour d'Annecy sont inclus (soit 40 km aller-retour). Au-delà, le déplacement est facturé 1 € par kilomètre supplémentaire parcouru. Par exemple, 5 km de plus à l'aller représentent 10 € aller-retour.",
  },
  {
    q: "Proposez-vous le nettoyage de canapé et de textile ?",
    a: "Oui. Le nettoyage textile comprend aspiration complète, shampoing, désinfection et traitement des odeurs. Un canapé 2/3 places est à 80 €, un canapé 3/4 places à 110 €, et un canapé 5 places et plus à partir de 150 €. Le textile passe par une demande personnalisée.",
  },
  {
    q: "Comment se passe la réservation d'un nettoyage auto ?",
    a: "Un parcours guidé en quelques étapes : intérieur ou extérieur, type de véhicule, formule, options, adresse, puis date et créneau. Le total se met à jour en direct et le récapitulatif reprend tout avant validation.",
  },
  {
    q: "Qu'est-ce que la formule Diamond ?",
    a: "C'est une prestation entièrement personnalisée selon le véhicule, son état et vos besoins. Son tarif est établi sur mesure : aucune estimation automatique, une demande adaptée est créée.",
  },
]

export function CleanyzerFaq({ entries = CLZ_FAQ }: { entries?: FaqEntry[] }) {
  const [open, setOpen] = useState<number | null>(0)
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
              className="flex w-full items-center justify-between gap-4 py-5 text-left"
            >
              <span className="text-base font-medium text-[var(--clz-fg)] md:text-lg">{item.q}</span>
              <span className="clz-check h-7 w-7 flex-none">
                {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </span>
            </button>
            {isOpen && (
              <p className="max-w-2xl pb-6 text-pretty leading-relaxed text-[var(--clz-muted)]">{item.a}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
