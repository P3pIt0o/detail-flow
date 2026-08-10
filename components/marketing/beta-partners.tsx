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
        <ul className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-8">
          {citable.map((company) => {
            const logo = (
              <Image
                src={company.logo || "/placeholder.svg"}
                alt={`Logo ${company.name}`}
                width={128}
                height={128}
                className="h-full w-full rounded-full object-cover"
              />
            )
            return (
              <li key={company.name} className="flex flex-col items-center gap-3">
                <div className="size-24 overflow-hidden rounded-full ring-1 ring-border/70 shadow-lg transition-transform duration-300 hover:scale-105 sm:size-28">
                  {company.url ? (
                    <a
                      href={company.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="block h-full w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {logo}
                    </a>
                  ) : (
                    logo
                  )}
                </div>
                <span className="max-w-[8rem] text-pretty text-xs font-medium leading-tight text-muted-foreground">
                  {company.name}
                </span>
              </li>
            )
          })}
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
