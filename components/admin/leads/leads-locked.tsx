import Link from "next/link"
import { ArrowRight, Lock, Users } from "lucide-react"

/**
 * État « verrouillé » de la page Prospects — affiché quand le tenant n'a pas la
 * feature `leads_crm`. Jamais une 404 : la route existe pour tous. On explique
 * la valeur et on oriente vers les offres, sans CTA d'achat automatique et sans
 * promettre d'intégration inexistante (aucune mention « Meta connecté »).
 */
export function LeadsLocked({ pricingHref }: { pricingHref: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-border bg-card p-8 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Users className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold text-foreground text-balance">
        Suivez vos demandes, vos relances et vos conversions au même endroit
      </h2>
      <p className="mt-2 text-sm text-muted-foreground text-pretty">
        Le CRM prospects est inclus dans la formule Ultime. Enregistrez vos prospects, notez vos échanges,
        planifiez vos relances et transformez-les en clients.
      </p>
      <Link
        href={pricingHref}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Voir les formules
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden="true" />
        Vos données restent privées et strictement isolées.
      </p>
    </div>
  )
}
