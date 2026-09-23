import { Check, ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

export const BOOKING_V2_STEP_COUNT = 4

function Stepper({ current }: { current: number }) {
  return (
    <div className="mb-6 flex items-center" aria-hidden="true">
      {Array.from({ length: BOOKING_V2_STEP_COUNT }, (_, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={i} className={cn("flex items-center", i < BOOKING_V2_STEP_COUNT - 1 && "flex-1")}>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                done && "bg-success text-success-foreground",
                active && "bg-primary text-primary-foreground",
                !done && !active && "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            {i < BOOKING_V2_STEP_COUNT - 1 && (
              <span className={cn("mx-1.5 h-0.5 flex-1 rounded-full", done ? "bg-success" : "bg-border")} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function StepHeader({
  step,
  badge,
  title,
  subtitle,
  onBack,
}: {
  step: number
  badge: string
  title: string
  subtitle: string
  onBack?: () => void
}) {
  return (
    <header>
      {onBack && (
        <div className="mb-4 flex">
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Retour
          </button>
        </div>
      )}
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-primary">{badge}</p>
      <h1 className="mb-1.5 text-balance text-2xl font-bold leading-tight text-foreground">{title}</h1>
      <p className="mb-5 text-pretty text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      <p className="sr-only">
        Étape {step + 1} sur {BOOKING_V2_STEP_COUNT}
      </p>
      <Stepper current={step} />
    </header>
  )
}

/** Libellé de section en capitales (OPTIONS, DATE, MATIN…). */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("mb-2.5 mt-5 text-xs font-semibold tracking-wide text-muted-foreground", className)}>{children}</p>
  )
}

export const bv2InputClass =
  "w-full rounded-lg border border-border bg-card px-3.5 py-3 text-base text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none sm:text-sm"

export const bv2LabelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"
