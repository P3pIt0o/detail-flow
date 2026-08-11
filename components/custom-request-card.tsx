import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"

/**
 * Card « Demande personnalisée » affichée sur la page publique des prestations.
 * Cohérente avec les cards de prestations (même rayon/bordure/fond) mais
 * clairement identifiable (accent de marque, icône, pas de prix). Son CTA ouvre
 * le parcours de demande dédié — ce n'est PAS une prestation réservable.
 */
export function CustomRequestCard({
  title,
  description,
  ctaLabel,
  href,
}: {
  title: string
  description: string
  ctaLabel: string
  href: string
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-primary/40 bg-primary/5 p-6 sm:p-8">
      <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="size-5" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-foreground text-balance">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
      <Link
        href={href}
        className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
      >
        {ctaLabel}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  )
}
