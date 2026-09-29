import { MapPin, Wallet, CalendarX } from "lucide-react"

/**
 * Bloc « Informations pratiques » de la page publique (LOT 2).
 *
 * Rendu UNIQUEMENT si au moins une information est renseignée dans le
 * configurateur (`public_page_config`). Purement additif : un tenant sans
 * config (ou sans ces champs) n'affiche rien → aucune régression. Composant
 * serveur, sans état.
 */
export function PracticalInfo({
  interventionZone,
  depositRuleText,
  cancellationPolicy,
}: {
  interventionZone: string | null
  depositRuleText: string | null
  cancellationPolicy: string | null
}) {
  const items = [
    { icon: MapPin, label: "Zone d'intervention", value: interventionZone },
    { icon: Wallet, label: "Acompte", value: depositRuleText },
    { icon: CalendarX, label: "Annulation", value: cancellationPolicy },
  ].filter((i) => i.value)

  if (items.length === 0) return null

  return (
    <section aria-labelledby="infos-pratiques" className="border-t border-border bg-card/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 id="infos-pratiques" className="mb-8 text-2xl font-bold text-foreground text-balance">
          Informations pratiques
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl border border-border bg-background p-5">
              <div className="mb-2 flex items-center gap-2 text-primary">
                <Icon className="size-5" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">{label}</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
