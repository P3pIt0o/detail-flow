import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { Tone } from "@/lib/customer-subscriptions/admin-labels"

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/15 text-foreground",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-primary/30 bg-primary/10 text-primary",
}

export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", TONE_CLASS[tone])}>
      {children}
    </span>
  )
}

/** Aide courte dépliable, accessible au clavier, sans dépendance. */
export function HelpTip({ label = "En savoir plus", children }: { label?: string; children: ReactNode }) {
  return (
    <details className="group text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded-full border border-primary/40 text-[10px]">
          ?
        </span>
        {label}
      </summary>
      <p className="mt-1.5 max-w-prose text-pretty leading-relaxed text-muted-foreground">{children}</p>
    </details>
  )
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4 sm:p-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {title && <h2 className="text-base font-semibold text-foreground text-balance">{title}</h2>}
            {description && <div className="text-sm leading-relaxed text-muted-foreground">{description}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children && <div className="max-w-sm text-sm leading-relaxed text-muted-foreground">{children}</div>}
    </div>
  )
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
      <dd className="text-sm font-medium text-foreground sm:text-right">{children}</dd>
    </div>
  )
}
