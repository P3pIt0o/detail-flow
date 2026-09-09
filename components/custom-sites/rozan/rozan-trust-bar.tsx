/**
 * Barre de confiance compacte, juste sous le hero. Reprend les arguments clés
 * en une ligne discrète (fond clair), pour rassurer immédiatement.
 */

import { Home, Droplets, MapPin } from "lucide-react"
import { RozanStars } from "./rozan-google-proof"
import { ROZAN_GOOGLE } from "./content"

const ITEMS = [
  { icon: Home, label: "À domicile" },
  { icon: Droplets, label: "Autonome eau & électricité" },
  { icon: MapPin, label: "Pays de Gex + Genève" },
] as const

export function RozanTrustBar() {
  return (
    <section aria-label="Points de réassurance" className="border-b border-[color:var(--rozan-line)] bg-[var(--rozan-surface)]">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6 lg:justify-between lg:px-8">
        {ITEMS.map((it) => (
          <span key={it.label} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--rozan-fg)]">
            <it.icon className="size-4 text-[var(--rozan-accent)]" aria-hidden="true" />
            {it.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--rozan-fg)]">
          <RozanStars rating={ROZAN_GOOGLE.rating} />
          Google
        </span>
      </div>
    </section>
  )
}
