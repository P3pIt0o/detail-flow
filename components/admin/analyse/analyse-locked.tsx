import Link from "next/link"
import { BarChart3, Lock, ArrowRight } from "lucide-react"

/**
 * État « verrouillé » de la page Analyse — affiché quand le tenant n'a AUCUN
 * droit statistique. Jamais une 404 : la route existe pour tous, on explique
 * simplement la valeur et on oriente (sans CTA d'achat automatique) vers les
 * offres. On ne promet AUCUNE fonctionnalité inexistante.
 */
export function AnalyseLocked({ pricingHref }: { pricingHref: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-border bg-card p-8 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <BarChart3 className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold text-foreground text-balance">
        Analysez la performance de votre activité
      </h2>
      <p className="mt-2 text-sm text-muted-foreground text-pretty">
        Suivez votre chiffre d&apos;affaires, vos rendez-vous, votre panier moyen et vos clients dans le temps.
        L&apos;analyse détaillée est incluse dans les offres supérieures.
      </p>
      <Link
        href={pricingHref}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Découvrir les offres
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden="true" />
        Vos données restent privées et strictement isolées.
      </p>
    </div>
  )
}
