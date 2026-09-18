/**
 * Primitives partagées des pages intérieures CLEANYZER (maquette Phase 1) :
 * bandeau de titre sombre (dégradé #000 → #0A84FF) + fil d'Ariane.
 */

import Link from "next/link"
import Image from "next/image"
import { ChevronRight } from "lucide-react"
import { CLZ_PREVIEW_BASE } from "./tokens"

const LOGO = "/custom-sites/cleanyzer/logo.png"

export function PageHero({
  eyebrow,
  title,
  intro,
  crumbs,
}: {
  eyebrow: string
  title: string
  intro?: string
  crumbs: { label: string; href?: string }[]
}) {
  return (
    <section className="clz-dark relative overflow-hidden">
      <Image src={LOGO || "/placeholder.svg"} alt="" aria-hidden width={760} height={180} className="clz-watermark -right-16 top-6 w-[min(70%,520px)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-10 md:px-6 md:pb-20 md:pt-14">
        <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1 text-xs text-[var(--clz-on-dark-muted)]">
          <Link href={CLZ_PREVIEW_BASE} className="hover:text-white">Accueil</Link>
          {crumbs.map((c) => (
            <span key={c.label} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              {c.href ? (
                <Link href={c.href} className="hover:text-white">{c.label}</Link>
              ) : (
                <span className="text-white/90">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        <span className="clz-eyebrow mt-8 block">{eyebrow}</span>
        <h1 className="clz-display clz-h1 mt-3 max-w-3xl text-balance text-white">{title}</h1>
        {intro && <p className="mt-5 max-w-2xl text-pretty leading-relaxed text-[var(--clz-on-dark-muted)]">{intro}</p>}
      </div>
    </section>
  )
}

/** Bloc "réponse directe" (utile SEO/GEO, cahier §19). */
export function DirectAnswer({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="clz-card border-l-2 border-l-[var(--clz-blue)] bg-[var(--clz-surface-2)] p-6">
      <p className="text-sm font-semibold text-[var(--clz-fg)]">{question}</p>
      <p className="mt-2 text-pretty leading-relaxed text-[var(--clz-muted)]">{answer}</p>
    </div>
  )
}
