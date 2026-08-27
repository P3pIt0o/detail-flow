"use client"

import { CheckCircle2, AlertCircle, Circle, ArrowRight, ClipboardList } from "lucide-react"
import type { BillingSetupItem, BillingSetupResult, BillingSetupState } from "@/lib/billing/setup-checklist"

/**
 * Carte « Configuration de votre facturation ».
 *
 * Affiche la progression réelle (pourcentage, éléments restants) et la liste des
 * étapes avec trois états (À terminer / À vérifier / Terminé). Distingue
 * clairement les éléments indispensables des recommandations non bloquantes.
 * Chaque étape défile vers le champ concerné et le met brièvement en évidence.
 */

const STATE_META: Record<
  BillingSetupState,
  { label: string; chip: string; Icon: typeof CheckCircle2; iconClass: string }
> = {
  todo: {
    label: "À terminer",
    chip: "bg-destructive/10 text-destructive",
    Icon: Circle,
    iconClass: "text-muted-foreground/50",
  },
  review: {
    label: "À vérifier",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    Icon: AlertCircle,
    iconClass: "text-amber-500",
  },
  done: {
    label: "Terminé",
    chip: "bg-primary/10 text-primary",
    Icon: CheckCircle2,
    iconClass: "text-primary",
  },
}

function focusField(anchor: string) {
  const el = document.getElementById(anchor)
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  const ring = ["ring-2", "ring-primary", "ring-offset-2", "ring-offset-background", "rounded-lg"]
  el.classList.add(...ring)
  window.setTimeout(() => el.classList.remove(...ring), 1800)
}

export function BillingSetupCard({ data }: { data: BillingSetupResult }) {
  const { items, percent, remaining, mandatoryTodo, allMandatoryDone } = data

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="billing-setup-title">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardList className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="billing-setup-title" className="text-base font-semibold text-foreground">
            Configuration de votre facturation
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
            {allMandatoryDone
              ? "Tout l'essentiel est renseigné. Vérifiez les points conseillés ci-dessous."
              : `${remaining} élément${remaining > 1 ? "s" : ""} à compléter ou vérifier${
                  mandatoryTodo > 0 ? `, dont ${mandatoryTodo} indispensable${mandatoryTodo > 1 ? "s" : ""}` : ""
                }.`}
          </p>
        </div>
        <span className="shrink-0 text-right">
          <span className="block text-2xl font-bold text-foreground">{percent}%</span>
          <span className="block text-[11px] text-muted-foreground">complété</span>
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item) => (
          <BillingSetupRow key={item.key} item={item} />
        ))}
      </ul>

      <p className="mt-4 text-[11px] text-muted-foreground text-pretty">
        Vous pouvez enregistrer à tout moment : seule la confirmation finale du profil requiert les éléments
        indispensables. Ces indications ne constituent pas un conseil fiscal.
      </p>
    </section>
  )
}

function BillingSetupRow({ item }: { item: BillingSetupItem }) {
  const meta = STATE_META[item.state]
  const { Icon } = meta
  return (
    <li>
      <button
        type="button"
        onClick={() => focusField(item.anchor)}
        className="group flex w-full items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40"
      >
        <Icon className={`mt-0.5 size-5 shrink-0 ${meta.iconClass}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{item.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.chip}`}>{meta.label}</span>
            {item.recommendation ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Conseillé
              </span>
            ) : (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Indispensable
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground text-pretty">{item.hint}</span>
        </span>
        <ArrowRight
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden="true"
        />
      </button>
    </li>
  )
}
