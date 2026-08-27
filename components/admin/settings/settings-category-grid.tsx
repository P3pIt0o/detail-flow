import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { SETTINGS_CATEGORIES } from "@/lib/admin/settings-nav"
import { withTenant } from "@/lib/tenant-link"

/**
 * Page d'accueil des Paramètres : 6 cartes cliquables (grille sur ordinateur,
 * liste verticale sur mobile). Chaque carte ouvre sa catégorie sur sa première
 * sous-section, en conservant systématiquement `?tenant=` via withTenant().
 *
 * Optionnel : la carte « Paiements et facturation » affiche l'avancement réel
 * de la configuration de facturation (déjà calculé côté serveur).
 */
export function SettingsCategoryGrid({
  tenantParam,
  billingPercent,
}: {
  tenantParam: string | null
  billingPercent?: number
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SETTINGS_CATEGORIES.map((cat) => {
        const Icon = cat.icon
        const firstTab = cat.subTabs[0]?.value
        const href = withTenant(`/admin/parametres?tab=${firstTab}`, tenantParam)
        const showBilling = cat.id === "billing" && typeof billingPercent === "number"
        return (
          <Link
            key={cat.id}
            href={href}
            className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">{cat.label}</h2>
                {showBilling && billingPercent! < 100 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {billingPercent}%
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">{cat.description}</p>
            </div>
            <ChevronRight
              className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden="true"
            />
          </Link>
        )
      })}
    </div>
  )
}
