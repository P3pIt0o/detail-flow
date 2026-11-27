import Link from "next/link"
import { Check, ChevronRight } from "lucide-react"
import type { SetupStep } from "@/lib/admin/today"
import { cn } from "@/lib/utils"
import { ShareLink } from "./share-link"

/** « Pour recevoir vos premières réservations » : chaque ligne ouvre le bon réglage. */
export function SetupList({ steps, doneCount, shareUrl }: { steps: SetupStep[]; doneCount: number; shareUrl: string }) {
  return (
    <section aria-labelledby="setup-title" className="rounded-2xl border border-primary/40 bg-primary/5 p-4 sm:p-5">
      <h2 id="setup-title" className="text-lg font-semibold text-foreground text-balance">
        Pour recevoir vos premières réservations
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {doneCount} {doneCount > 1 ? "étapes" : "étape"} sur {steps.length}
      </p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        aria-label="Avancement"
      >
        <div className="h-full bg-primary" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <ol className="mt-2 flex flex-col divide-y divide-border">
        {steps.map((step) => {
          const content = (
            <>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                  step.done ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {step.done ? <Check className="size-4" aria-hidden="true" /> : null}
              </span>
              <span className={cn("min-w-0 flex-1 text-base", step.done ? "text-muted-foreground line-through" : "text-foreground")}>
                {step.title}
                <span className="sr-only">{step.done ? " (fait)" : " (à faire)"}</span>
              </span>
            </>
          )
          return (
            <li key={step.key}>
              {step.href && !step.done ? (
                <Link href={step.href} className="flex min-h-14 items-center gap-3 py-2 hover:text-primary">
                  {content}
                  <span className="flex shrink-0 items-center text-sm font-semibold text-primary">
                    {step.key === "page" ? "Ouvrir" : "Régler"}
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              ) : (
                <div className="flex min-h-14 items-center gap-3 py-2">{content}</div>
              )}
              {step.key === "share" && !step.done ? (
                <div className="pb-1">
                  <ShareLink url={shareUrl} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
