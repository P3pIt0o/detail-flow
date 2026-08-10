"use client"

/**
 * `ScrollStage` — orchestrateur de l'expérience de scroll.
 *
 * - Source unique de la timeline : un seul `useScroll` + `useSpring`
 *   produisent `scrollYProgress`, transmis au panneau 3D persistant
 *   (`DetailFlowPanel`) et à chaque scène narrative via `StageTextSlot`.
 * - `prefers-reduced-motion` : bascule entièrement sur `StaticMarketingContent`
 *   (sections empilées classiques, aucune dépendance à la timeline animée).
 * - Aucune interaction (CTA, formulaire, accordéon FAQ) n'est jamais bloquée :
 *   le panneau 3D est `pointer-events-none`, et chaque scène narrative ne
 *   redevient cliquable que lorsqu'elle est réellement visible.
 */

import { useRef, type ReactNode } from "react"
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion"
import { DetailFlowPanel } from "./detailflow-panel"
import { useDepthFactor } from "./use-depth-factor"
import { StaticMarketingContent } from "./static-marketing-content"
import { STAGE_RANGE, TOTAL_SCROLL_VH, fadeRange, mapOutput, type StageKey } from "./scroll-timeline"
import { SceneHero } from "./scene-hero"
import { SceneOverview } from "./scene-overview"
import { SceneFeatures } from "./scene-features"
import { SceneBenefits } from "./scene-benefits"
import { ScenePartners } from "./scene-partners"
import { SceneBeta } from "./scene-beta"
import { SceneFaq } from "./scene-faq"

/** Enveloppe narrative d'une étape : dérive opacité/décalage/pointer-events de la timeline. */
function StageTextSlot({
  progress,
  stageKey,
  children,
  className,
}: {
  progress: MotionValue<number>
  stageKey: StageKey
  children: ReactNode
  className?: string
}) {
  const fade = fadeRange(STAGE_RANGE[stageKey])
  const opacity = useTransform(progress, fade.input, fade.output)
  const yFade = mapOutput(fade, 16, 0)
  const y = useTransform(progress, yFade.input, yFade.output)
  const pointerEvents = useTransform(opacity, (v) => (v > 0.5 ? "auto" : "none"))

  return (
    <motion.div
      className={className ?? "absolute inset-0 flex items-center px-4 sm:px-6 lg:px-0"}
      style={{ opacity, y, pointerEvents }}
    >
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </motion.div>
  )
}

export function ScrollStage() {
  const reducedMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const depth = useDepthFactor()

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] })
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.4 })

  if (reducedMotion) {
    return <StaticMarketingContent />
  }

  return (
    <div ref={containerRef} className="relative" style={{ height: `${TOTAL_SCROLL_VH}vh` }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-gradient-to-b from-primary/10 via-transparent to-transparent"
      />
      <div className="sticky top-16 h-[calc(100vh-4rem)] w-full overflow-hidden">
        <div className="relative mx-auto flex h-full max-w-7xl flex-col items-center justify-center gap-6 px-4 sm:px-6 md:flex-row md:justify-between md:gap-10 lg:px-8">
          {/* Colonne texte : les 7 scènes narratives, empilées, une seule visible à la fois */}
          <div className="relative order-2 h-[62vh] w-full md:order-1 md:h-[70vh] md:w-1/2">
            <StageTextSlot progress={progress} stageKey="hero">
              <SceneHero />
            </StageTextSlot>
            <StageTextSlot progress={progress} stageKey="overview">
              <SceneOverview />
            </StageTextSlot>
            <StageTextSlot progress={progress} stageKey="features">
              <SceneFeatures />
            </StageTextSlot>
            <StageTextSlot progress={progress} stageKey="benefits">
              <SceneBenefits />
            </StageTextSlot>
            <StageTextSlot progress={progress} stageKey="partners">
              <ScenePartners />
            </StageTextSlot>
            <StageTextSlot progress={progress} stageKey="beta" className="absolute inset-0 flex items-center px-0">
              <div className="mx-auto w-full max-w-none px-4 sm:px-0">
                <SceneBeta />
              </div>
            </StageTextSlot>
            <StageTextSlot progress={progress} stageKey="faq" className="absolute inset-0 flex items-center px-0">
              <div className="mx-auto w-full max-w-none px-4 sm:px-0">
                <SceneFaq />
              </div>
            </StageTextSlot>
          </div>

          {/* Colonne objet 3D persistant : monté une seule fois, jamais démonté */}
          <div className="relative order-1 w-full md:order-2 md:w-1/2">
            <DetailFlowPanel progress={progress} depth={depth} />
          </div>
        </div>
      </div>
    </div>
  )
}
