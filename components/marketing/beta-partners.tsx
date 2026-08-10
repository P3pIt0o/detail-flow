/**
 * Section "Déjà testé sur le terrain" — remplace les témoignages.
 *
 * Composant unique (logique centralisée, auditable) réutilisé à la fois par
 * le rendu statique (`prefers-reduced-motion`) et par la scène cinématique
 * (`scene-partners.tsx`), afin d'éviter toute duplication de la règle
 * anti-invention de données.
 *
 * RÈGLE STRICTE : aucune entreprise n'est affichée sans `consent: true`, et
 * aucun chiffre n'est affiché si `count` est `null`. Tant que ni l'un ni
 * l'autre n'est fourni, seul un message générique neutre est affiché.
 */

import Image from "next/image"
import { marketing } from "@/config/marketing"

export function BetaPartners() {
  const { label, fallbackNote, count, companies } = marketing.betaPartners
  const citable = companies.filter((c) => c.consent)

  return (
    <div className="text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">{label}</p>

      {citable.length > 0 ? (
        <ul className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          {citable.map((company) => (
            <li
              key={company.name}
              className="flex h-16 w-40 items-center justify-center rounded-lg border border-border bg-card/60 px-4 py-2 grayscale transition-all hover:grayscale-0"
            >
              {company.url ? (
                <a
                  href={company.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex h-full w-full items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Image
                    src={company.logo}
                    alt={company.name}
                    width={160}
                    height={64}
                    className="max-h-10 w-auto object-contain"
                  />
                </a>
              ) : (
                <Image
                  src={company.logo}
                  alt={company.name}
                  width={160}
                  height={64}
                  className="max-h-10 w-auto object-contain"
                />
              )}
            </li>
          ))}
        </ul>
      ) : count && count > 0 ? (
        <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          {count} entreprises de detailing testent actuellement DetailFlow.
        </p>
      ) : (
        <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          {fallbackNote}
        </p>
      )}
    </div>
  )
}
