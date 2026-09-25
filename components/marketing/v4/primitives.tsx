import type { ReactNode } from "react"
import Image from "next/image"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Primitives visuelles de la landing DetailFlow (v4).
 * Server Components purs : aucune dépendance client, réutilisés par toutes les
 * sections. Exclusivement utilisés par `app/marketing` — jamais par un tenant.
 */

/** Monogramme officiel DetailFlow (icône PWA existante `public/icons`). */
export function DetailFlowMark({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/icon-192.png"
      alt=""
      width={96}
      height={96}
      className={cn("rounded-[26%] ring-1 ring-foreground/10", className)}
    />
  )
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8", className)}>{children}</div>
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary", className)}>
      {children}
    </p>
  )
}

export function SectionIntro({
  eyebrow,
  title,
  lead,
  align = "left",
  className,
  titleId,
}: {
  eyebrow?: string
  title: ReactNode
  lead?: ReactNode
  align?: "left" | "center"
  className?: string
  titleId?: string
}) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-4", align === "center" && "mx-auto items-center text-center", className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2
        id={titleId}
        className="text-balance text-3xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-4xl lg:text-5xl"
      >
        {title}
      </h2>
      {lead && <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">{lead}</p>}
    </div>
  )
}

/** Fenêtre navigateur très sobre, contenu rendu dans la palette RÉELLE de l'admin. */
export function AppWindow({
  url,
  children,
  className,
  bodyClassName,
}: {
  url: string
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <div
      className={cn(
        "df-product overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-[0_40px_120px_-40px_oklch(0.25_0.08_260/0.55),0_0_0_1px_oklch(0.2_0.02_262/0.08)]",
        className,
      )}
    >
      <div className="flex h-10 items-center gap-3 border-b border-border bg-card/60 px-4">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <div className="mx-auto flex h-6 min-w-0 max-w-xs flex-1 items-center justify-center rounded-md bg-muted/70 px-3">
          <span className="truncate font-mono text-[11px] text-muted-foreground">{url}</span>
        </div>
        <span className="w-10" aria-hidden="true" />
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  )
}

/** Cadre smartphone neutre : DetailFlow est une web app responsive (pas une app native). */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "df-product relative w-[260px] shrink-0 rounded-[2.4rem] border border-foreground/10 bg-[oklch(0.12_0.012_260)] p-2 shadow-[0_40px_90px_-30px_oklch(0.25_0.08_260/0.6)]",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-[1.9rem] bg-background text-foreground">
        <div className="flex h-7 items-center justify-center" aria-hidden="true">
          <span className="h-1.5 w-16 rounded-full bg-foreground/15" />
        </div>
        {children}
      </div>
    </div>
  )
}

/** Micro-événement produit (« Nouvelle réservation », « Acompte payé »…). */
export function EventToast({
  icon: Icon,
  title,
  meta,
  tone = "primary",
  className,
}: {
  icon: LucideIcon
  title: string
  meta?: string
  tone?: "primary" | "success" | "warning"
  className?: string
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-500/12 text-emerald-400"
      : tone === "warning"
        ? "bg-amber-500/12 text-amber-400"
        : "bg-primary/15 text-primary"
  return (
    <div
      className={cn(
        "df-product flex items-center gap-3 rounded-xl border border-border bg-card/95 px-3.5 py-3 text-foreground shadow-[0_20px_50px_-20px_oklch(0.2_0.05_260/0.6)] backdrop-blur",
        className,
      )}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", toneClass)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-tight">{title}</p>
        {meta && <p className="mt-0.5 truncate text-[11.5px] leading-tight text-muted-foreground">{meta}</p>}
      </div>
    </div>
  )
}

/** Petite étiquette mono (microcopy entre modules). */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  )
}
