import { cn } from "@/lib/utils"
import { Reveal } from "./reveal"

/**
 * En-tête de section réutilisable : petit label, titre et sous-titre.
 * Centralise la typographie des sections pour une cohérence parfaite.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  className,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  align?: "center" | "left"
  className?: string
}) {
  return (
    <Reveal
      className={cn(
        "max-w-2xl",
        align === "center" ? "mx-auto text-center" : "text-left",
        className,
      )}
    >
      {eyebrow && (
        <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-widest text-primary">
          {eyebrow}
        </span>
      )}
      <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">{subtitle}</p>}
    </Reveal>
  )
}
