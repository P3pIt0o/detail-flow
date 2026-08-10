/** Contenu narratif de l'étape "benefits". Rôle strictement narratif. */

import { Check } from "lucide-react"
import { marketing } from "@/config/marketing"

export function SceneBenefits() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center md:items-start md:text-left">
      <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{marketing.benefits.title}</h2>
      <ul className="mt-6 space-y-3 text-left">
        {marketing.benefits.items.map((b) => (
          <li key={b.title} className="flex items-start gap-3">
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Check className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{b.title}</p>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{b.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
