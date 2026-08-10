"use client"

/**
 * `ScrollStage` — expérience de scroll immersive DetailFlow (V2).
 *
 * Architecture :
 *  1. Un conteneur haut (`TOTAL_SCROLL_VH`) avec un enfant `sticky` plein
 *     écran : c'est la SCÈNE IMMERSIVE (hero → « un seul outil » →
 *     fonctionnalités → finale). Le panneau 3D (`DetailFlowPanel`) est monté
 *     une seule fois ici et occupe tout le viewport ; les textes narratifs
 *     apparaissent AUTOUR de lui.
 *  2. La scène se termine (le dashboard recule, le halo s'éteint), PUIS le
 *     flux DOM NORMAL reprend : Bénéfices, Partenaires, Programme Beta
 *     (pleine largeur, formulaire au calme), FAQ. Ces sections ne sont plus
 *     dans le `sticky` → aucun chevauchement possible avec le panneau 3D.
 *
 * `prefers-reduced-motion` : bascule entièrement sur `StaticMarketingContent`.
 */

import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { marketing } from "@/config/marketing"
import { DetailFlowPanel } from "./detailflow-panel"
import { useDepthFactor } from "./use-depth-factor"
import { StaticMarketingContent } from "./static-marketing-content"
import { STAGE_RANGE, TOTAL_SCROLL_VH, subRange, stageFade, mapOutput, type StageKey } from "./scroll-timeline"
import { BenefitsSection, PartnersSection, BetaSection, FaqSection } from "./marketing-sections"
import { FEATURE_SCENE_LABELS } from "./detailflow-panel"

/** Couche narrative : dérive opacité + léger décalage vertical d'une plage. */
function NarrativeLayer({
  progress,
  range,
  margin = 0.18,
  className,
  children,
}: {
  progress: MotionValue<number>
  range: readonly [number, number]
  margin?: number
  className?: string
  children: ReactNode
}) {
  const fade = stageFade(range, margin)
  const opacity = useTransform(progress, fade.input, fade.output)
  const yFade = mapOutput(fade, 22, 0)
  const y = useTransform(progress, yFade.input, yFade.output)
  const pointerEvents = useTransform(opacity, (v) => (v > 0.5 ? "auto" : "none"))
  return (
    <motion.div className={className} style={{ opacity, y, pointerEvents }}>
      {children}
    </motion.div>
  )
}

/** Légende d'un « moment » fonctionnalité (acte features), synchronisée. */
function FeatureCaption({
  progress,
  index,
  total,
  label,
}: {
  progress: MotionValue<number>
  index: number
  total: number
  label: string
}) {
  const range = subRange(STAGE_RANGE.features, index / total, (index + 1) / total)
  const fade = stageFade(range, 0.22)
  const opacity = useTransform(progress, fade.input, fade.output)
  const yFade = mapOutput(fade, 16, 0)
  const y = useTransform(progress, yFade.input, yFade.output)
  return (
    <motion.div className="absolute inset-x-0 bottom-[8vh] flex justify-center px-4" style={{ opacity, y }}>
      <div className="max-w-md rounded-2xl border border-border/70 bg-background/80 px-6 py-4 text-center shadow-xl backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Fonctionnalité {index + 1} / {total}
        </p>
        <p className="mt-1 text-lg font-semibold text-foreground">{label}</p>
      </div>
    </motion.div>
  )
}

function ImmersiveScene() {
  const containerRef = useRef<HTMLDivElement>(null)
  const depth = useDepthFactor()

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] })
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.45 })

  const features = marketing.features

  return (
    <div ref={containerRef} className="relative" style={{ height: `${TOTAL_SCROLL_VH}vh` }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* Panneau 3D plein écran, monté une seule fois */}
        <DetailFlowPanel progress={progress} depth={depth} />

        {/* --------------------------- Narration --------------------------- */}
        <div className="pointer-events-none absolute inset-0">
          {/* Scrim dégradé sous le hero : garantit la lisibilité du texte
              par-dessus le dashboard, puis disparaît quand on entre. */}
          <NarrativeLayer progress={progress} range={STAGE_RANGE.hero} className="absolute inset-0">
            <div className="absolute inset-x-0 bottom-0 h-[68%] bg-gradient-to-t from-background via-background/85 to-transparent" />
          </NarrativeLayer>

          {/* ACTE 1 — Hero (le seul bloc avec des CTA cliquables) */}
          <NarrativeLayer
            progress={progress}
            range={STAGE_RANGE.hero}
            className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-[7vh] sm:px-6"
          >
            <div className="max-w-2xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/70 px-4 py-1.5 text-sm text-primary backdrop-blur">
                {marketing.hero.badge}
              </span>
              <h1 className="mt-5 text-balance text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                {marketing.hero.title}
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                {marketing.hero.subtitle}
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href={marketing.hero.primaryCta.href}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110"
                >
                  {marketing.hero.primaryCta.label}
                  <ArrowRight className="size-5" aria-hidden="true" />
                </Link>
                <Link
                  href={marketing.hero.secondaryCta.href}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-background/50 px-8 text-base font-semibold text-foreground backdrop-blur transition-colors hover:border-primary/50"
                >
                  {marketing.hero.secondaryCta.label}
                </Link>
              </div>
              <p className="mt-8 animate-pulse text-xs uppercase tracking-widest text-muted-foreground">
                Défilez pour entrer dans DetailFlow
              </p>
            </div>
          </NarrativeLayer>

          {/* ACTE 2 — « Un seul outil » (texte en haut, la convergence est 3D) */}
          <NarrativeLayer progress={progress} range={STAGE_RANGE.overview} margin={0.22} className="absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-background via-background/85 to-transparent" />
          </NarrativeLayer>
          <NarrativeLayer
            progress={progress}
            range={STAGE_RANGE.overview}
            margin={0.22}
            className="absolute inset-x-0 top-[7vh] flex justify-center px-4 sm:px-6"
          >
            <div className="max-w-xl text-center">
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{marketing.overview.title}</h2>
              <p className="mx-auto mt-3 max-w-lg text-pretty leading-relaxed text-muted-foreground">
                {marketing.overview.description}
              </p>
            </div>
          </NarrativeLayer>

          {/* ACTE 3 — Fonctionnalités : une légende par moment */}
          {FEATURE_SCENE_LABELS.map((label, i) => (
            <FeatureCaption
              key={label}
              progress={progress}
              index={i}
              total={FEATURE_SCENE_LABELS.length}
              label={label}
            />
          ))}

          {/* ACTE 4 — Finale : « Tout est connecté » */}
          <NarrativeLayer
            progress={progress}
            range={subRange(STAGE_RANGE.finale, 0, 0.72)}
            margin={0.24}
            className="absolute inset-x-0 top-[10vh] flex justify-center px-4 sm:px-6"
          >
            <div className="max-w-2xl text-center">
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Tout est connecté.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground">
                Votre activité aussi devrait l&apos;être.
              </p>
            </div>
          </NarrativeLayer>
        </div>
      </div>
    </div>
  )
}

export function ScrollStage() {
  // `useReducedMotion` renvoie `null` en SSR puis se résout : on ne bascule
  // sur le rendu statique qu'après montage, pour éviter un mismatch
  // d'hydratation (SSR et premier rendu client identiques).
  const [mounted, setMounted] = useState(false)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (mounted && reducedMotion) {
    return <StaticMarketingContent />
  }

  return (
    <>
      <ImmersiveScene />
      {/* Flux DOM normal — hors du sticky, aucun élément 3D au-dessus/derrière */}
      <BenefitsSection />
      <PartnersSection />
      <BetaSection />
      <FaqSection />
    </>
  )
}
