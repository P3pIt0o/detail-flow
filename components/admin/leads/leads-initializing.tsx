import { Loader2 } from "lucide-react"

/**
 * État « module en cours d'initialisation » — affiché quand le tenant possède
 * la feature `leads_crm` MAIS que les tables CRM ne sont pas encore présentes
 * (migration additive appliquée séparément du code). On évite ainsi une 500 et
 * on n'affiche AUCUN faux succès (pas de « 0 prospect » trompeur). Une fois la
 * migration appliquée, la page fonctionne normalement sans autre changement.
 */
export function LeadsInitializing() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold text-foreground text-balance">
        Le module Prospects est en cours d&apos;initialisation
      </h2>
      <p className="mt-2 text-sm text-muted-foreground text-pretty">
        Votre espace prospects sera disponible dans un instant. Aucune action de votre part n&apos;est
        nécessaire — vos demandes et réservations continuent d&apos;être enregistrées normalement.
      </p>
    </div>
  )
}
