/**
 * Contenu narratif de l'étape "hero". Rôle strictement narratif — aucune
 * logique d'animation ici : le style (opacité, décalage, pointer-events) est
 * appliqué par `StageTextSlot` dans `scroll-stage.tsx`.
 */

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { marketing } from "@/config/marketing"

export function SceneHero() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center md:items-start md:text-left">
      <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card/60 px-4 py-1.5 text-sm text-primary backdrop-blur">
        {marketing.hero.badge}
      </span>
      <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
        {marketing.hero.title}
      </h1>
      <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
        {marketing.hero.subtitle}
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row md:items-start">
        <Link
          href={marketing.hero.primaryCta.href}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110"
        >
          {marketing.hero.primaryCta.label}
          <ArrowRight className="size-5" aria-hidden="true" />
        </Link>
        <Link
          href={marketing.hero.secondaryCta.href}
          className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card/50 px-8 text-base font-semibold text-foreground backdrop-blur transition-colors hover:border-primary/50"
        >
          {marketing.hero.secondaryCta.label}
        </Link>
      </div>
    </div>
  )
}
