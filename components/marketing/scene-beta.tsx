/**
 * Contenu narratif + conversion de l'étape "beta". `BetaForm` n'est pas
 * modifié : il est simplement positionné dans cette scène.
 */

import { Check } from "lucide-react"
import { marketing } from "@/config/marketing"
import { BetaForm } from "@/components/marketing/beta-form"

export function SceneBeta() {
  return (
    <div className="grid h-full max-h-[85vh] w-full gap-6 overflow-y-auto py-6 md:max-h-none md:grid-cols-2 md:items-center md:overflow-visible">
      <div className="text-center md:text-left">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          {marketing.beta.badge}
        </span>
        <h2 className="mt-5 text-balance text-2xl font-bold tracking-tight sm:text-3xl">{marketing.beta.title}</h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{marketing.beta.lead}</p>
        <ul className="mt-6 space-y-3 text-left">
          {marketing.beta.points.map((p) => (
            <li key={p} className="flex items-start gap-3">
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Check className="size-4" aria-hidden="true" />
              </div>
              <span className="text-pretty text-sm leading-relaxed text-foreground">{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <BetaForm />
    </div>
  )
}
