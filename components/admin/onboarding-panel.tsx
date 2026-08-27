"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Rocket, Check, ArrowRight, X, PartyPopper } from "lucide-react"
import type { OnboardingResult } from "@/lib/onboarding/steps"

/**
 * Panneau « Vos premiers pas » du tableau de bord.
 *
 * - Progression 100 % calculée côté serveur à partir des données réelles
 *   (aucune case cochée à la main).
 * - Une étape terminée reste visible avec sa coche pendant la configuration.
 * - Quand tout est terminé : état de réussite bref + possibilité de masquer.
 * - Le masquage est une simple préférence d'affichage (localStorage), jamais une
 *   donnée métier : n'impacte ni la base, ni un autre appareil/tenant.
 * - Ne bloque jamais l'utilisation de DetailFlow.
 */

const STORAGE_KEY = "df_onboarding_hidden_v1"

export function OnboardingPanel({ data }: { data: OnboardingResult }) {
  const [mounted, setMounted] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      setHidden(localStorage.getItem(STORAGE_KEY) === "1")
    } catch {
      /* localStorage indisponible : on affiche le panneau */
    }
  }, [])

  function dismiss() {
    setHidden(true)
    try {
      localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      /* ignore */
    }
  }

  // Évite tout flash d'un panneau déjà masqué (rendu stable avec le SSR).
  if (!mounted || hidden) return null

  const { steps, doneCount, total, allDone, percent } = data

  if (allDone) {
    return (
      <section
        aria-label="Configuration terminée"
        className="mb-6 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PartyPopper className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Votre configuration est complète</p>
          <p className="text-xs text-muted-foreground text-pretty">
            Tout est prêt. Vous pouvez masquer ce rappel.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          Masquer
        </button>
      </section>
    )
  }

  return (
    <section aria-label="Vos premiers pas" className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Rocket className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Vos premiers pas avec DetailFlow</h2>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            {doneCount} étape{doneCount > 1 ? "s" : ""} sur {total} terminée{doneCount > 1 ? "s" : ""}. Ce bloc
            disparaîtra une fois toutes les étapes faites.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Masquer le panneau"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>

      {/* Barre de progression */}
      <div className="mt-3" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-border">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className="group flex items-start gap-3 py-3 transition-colors hover:bg-muted/40 -mx-2 rounded-lg px-2"
            >
              <span
                className={
                  step.done
                    ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    : "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40"
                }
                aria-hidden="true"
              >
                {step.done ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={
                    step.done
                      ? "block text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/40"
                      : "block text-sm font-medium text-foreground"
                  }
                >
                  {step.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground text-pretty">{step.description}</span>
              </span>
              <ArrowRight
                className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
