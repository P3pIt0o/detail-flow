/**
 * Rendu « une phrase par ligne » d'un texte éditorial Spirit ACS.
 *
 * Reçoit une chaîne (valeur par défaut du code, `heroSubtitle`, `siteContent…`)
 * et affiche chaque phrase dans un bloc distinct, SANS toucher à la donnée
 * (aucune écriture en base, aucun HTML injecté, pas de dangerouslySetInnerHTML).
 *
 * Réservé aux PARAGRAPHES éditoriaux du site Spirit : ne pas l'utiliser pour
 * les avis clients, les textes saisis par des visiteurs, les titres, boutons,
 * adresses, téléphones, e-mails, URL, prix ou notes.
 */

import type { ElementType } from "react"
import { splitSentences } from "./sentences"

type SpiritSentencesProps = {
  text: string | null | undefined
  /** Élément conteneur (par défaut <p>). */
  as?: ElementType
  className?: string
}

export function SpiritSentences({ text, as: Tag = "p", className }: SpiritSentencesProps) {
  const lines = splitSentences(text)
  if (lines.length === 0) return null
  return (
    <Tag className={className}>
      {lines.map((line, i) => (
        // `block` : une ligne = un bloc ; aucun <br>, donc aucun double saut.
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </Tag>
  )
}
