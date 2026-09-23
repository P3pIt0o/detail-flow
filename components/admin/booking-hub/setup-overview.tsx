import Link from "next/link"
import { AlertCircle, ArrowRight, CheckCircle2, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export type ReadinessItem = { id: string; todo: string; href: string }

export type ChecklistItem = {
  id: string
  title: string
  question: string
  summary: string
  ready: boolean
  href: string
}

/** Étape numérotée du parcours Configurer → Tester → Partager. */
export function StepHeading({
  n,
  label,
  text,
  done,
  as: Tag = "h2",
}: {
  n: number
  label: string
  text: string
  done?: boolean
  as?: "h2" | "h3"
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          done ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground",
        )}
        aria-hidden="true"
      >
        {done ? <CheckCircle2 className="size-4" /> : n}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Tag className="text-xs font-bold tracking-widest text-primary">
          <span className="sr-only">Étape {n} : </span>
          {label}
        </Tag>
        <p className="text-base leading-snug text-foreground text-pretty">{text}</p>
      </div>
    </div>
  )
}

/** « Votre réservation est prête » ou la liste cliquable des éléments manquants. */
export function ReadinessBanner({ missing }: { missing: ReadinessItem[] }) {
  if (missing.length === 0) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-4">
        <CheckCircle2 className="size-6 shrink-0 text-success" aria-hidden="true" />
        <p className="text-base font-semibold text-foreground">Votre réservation est prête</p>
      </div>
    )
  }

  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-center gap-3">
        <AlertCircle className="size-6 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-base font-semibold text-foreground">
          {missing.length === 1 ? "Il reste 1 élément à configurer" : `Il reste ${missing.length} éléments à configurer`}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {missing.map((m) => (
          <li key={m.id}>
            <Link
              href={m.href}
              className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 text-base font-medium text-foreground transition-colors hover:border-primary/50"
            >
              {m.todo}
              <ArrowRight className="size-5 shrink-0 text-primary" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Configuration actuelle lisible d'un coup d'œil, un bouton « Modifier » par section. */
export function SetupChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {items.map((it) => (
        <li key={it.id}>
          <Link
            href={it.href}
            className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
          >
            {it.ready ? (
              <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Configuré" />
            ) : (
              <AlertCircle className="size-5 shrink-0 text-warning" aria-label="À configurer" />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-semibold text-foreground">{it.title}</span>
              <span className={cn("truncate text-sm", it.ready ? "text-muted-foreground" : "text-warning")}>
                {it.summary}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
              Modifier
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
