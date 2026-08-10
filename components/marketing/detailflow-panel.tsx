"use client"

/**
 * `DetailFlowPanel` — l'UNIQUE objet 3D persistant qui traverse toute
 * l'expérience de scroll, du hero jusqu'à la conversion.
 *
 * Monté une seule fois par `scroll-stage.tsx` : jamais démonté/remonté entre
 * les étapes. Purement piloté par des `MotionValue` dérivées de la timeline
 * globale (`progress`) — aucun état interne narratif, aucune logique de
 * scroll indépendante. Les changements de contenu sont des fondus animés
 * (superposition + interpolation d'opacité), jamais des remplacements DOM
 * bruts.
 *
 * Purement décoratif : `pointer-events: none` sur l'ensemble de l'arbre pour
 * ne jamais intercepter de clic/tap destiné aux CTA ou au contenu narratif.
 */

import type { ReactNode } from "react"
import Image from "next/image"
import { motion, useTransform, type MotionValue } from "framer-motion"
import { Calendar, FileText, Gauge, MapPin, Palette, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { marketing } from "@/config/marketing"
import { STAGE_RANGE, STAGE_BOUNDARIES, fadeRange } from "./scroll-timeline"

// Keyframes de "voyage" de l'objet dans l'espace, alignées sur STAGE_BOUNDARIES
// (8 points délimitant les 7 étapes). Amplitude modérée pour rester premium,
// jamais grossière.
const ROTATE_Y_KEYFRAMES = [-9, 0, 7, -4, 8, -6, 3, 0]
const ROTATE_X_KEYFRAMES = [11, 4, -2, 3, -3, 2, -1, 0]
const SCALE_KEYFRAMES = [0.9, 1, 1.07, 1, 0.95, 1.02, 0.92, 0.8]
const DRIFT_Y_KEYFRAMES = [36, 0, -10, 0, 10, -6, 0, -28]

function useDepthScaled(raw: MotionValue<number>, depth: MotionValue<number>, baseline = 0) {
  return useTransform([raw, depth], (values) => {
    const [value, factor] = values as [number, number]
    return baseline + (value - baseline) * factor
  })
}

export function DetailFlowPanel({
  progress,
  depth,
}: {
  progress: MotionValue<number>
  depth: MotionValue<number>
}) {
  const rotateYRaw = useTransform(progress, STAGE_BOUNDARIES, ROTATE_Y_KEYFRAMES)
  const rotateXRaw = useTransform(progress, STAGE_BOUNDARIES, ROTATE_X_KEYFRAMES)
  const scaleRaw = useTransform(progress, STAGE_BOUNDARIES, SCALE_KEYFRAMES)
  const driftYRaw = useTransform(progress, STAGE_BOUNDARIES, DRIFT_Y_KEYFRAMES)

  const rotateY = useDepthScaled(rotateYRaw, depth)
  const rotateX = useDepthScaled(rotateXRaw, depth)
  const scale = useDepthScaled(scaleRaw, depth, 1)
  const driftY = useDepthScaled(driftYRaw, depth)

  const faqRange = STAGE_RANGE.faq
  const panelOpacity = useTransform(
    progress,
    [0, faqRange[0], faqRange[0] + (faqRange[1] - faqRange[0]) * 0.45, 1],
    [1, 1, 0, 0],
  )

  return (
    <motion.div className="pointer-events-none select-none" style={{ opacity: panelOpacity }} aria-hidden="true">
      <div className="mx-auto w-[min(88vw,560px)]" style={{ perspective: 1400 }}>
        <motion.div
          className="relative will-change-transform"
          style={{ rotateX, rotateY, scale, y: driftY, transformStyle: "preserve-3d" }}
        >
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/20">
            <Image
              src="/marketing/dashboard-preview.png"
              alt=""
              width={1600}
              height={1000}
              priority
              className="h-auto w-full"
            />
          </div>

          <OverlayLayer progress={progress} range={STAGE_RANGE.overview}>
            <OverviewOverlay />
          </OverlayLayer>

          <FeaturesOverlay progress={progress} />

          <OverlayLayer progress={progress} range={STAGE_RANGE.benefits}>
            <BenefitsOverlay />
          </OverlayLayer>

          <OverlayLayer progress={progress} range={STAGE_RANGE.partners}>
            <PartnersOverlay />
          </OverlayLayer>

          <OverlayLayer progress={progress} range={STAGE_RANGE.beta}>
            <BetaOverlay />
          </OverlayLayer>
        </motion.div>
      </div>
    </motion.div>
  )
}

/** Couche de contenu superposée au panneau, en fondu (crossfade) sur une plage. */
function OverlayLayer({
  progress,
  range,
  children,
  className,
}: {
  progress: MotionValue<number>
  range: readonly [number, number]
  children: ReactNode
  className?: string
}) {
  const { input, output } = fadeRange(range)
  const opacity = useTransform(progress, input, output)
  return (
    <motion.div
      className={cn("pointer-events-none absolute inset-0 flex items-center justify-center p-5 sm:p-8", className)}
      style={{ opacity }}
    >
      {children}
    </motion.div>
  )
}

function OverviewOverlay() {
  return (
    <div className="rounded-xl border border-primary/30 bg-background/85 px-5 py-3 text-center shadow-lg backdrop-blur">
      <p className="text-sm font-semibold text-foreground sm:text-base">{marketing.overview.title}</p>
    </div>
  )
}

const FEATURE_ICONS = [Calendar, FileText, Gauge, MapPin, Palette, ShieldCheck]

/** Sous-panneaux (features) : se déplient depuis le panneau principal, en cascade. */
function FeaturesOverlay({ progress }: { progress: MotionValue<number> }) {
  const range = STAGE_RANGE.features
  const { input, output } = fadeRange(range)
  const groupOpacity = useTransform(progress, input, output)

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 sm:gap-3 sm:p-6"
      style={{ opacity: groupOpacity }}
    >
      {marketing.features.map((feature, index) => (
        <FeatureTile
          key={feature.title}
          progress={progress}
          range={range}
          index={index}
          total={marketing.features.length}
          icon={FEATURE_ICONS[index] ?? Calendar}
          title={feature.title}
        />
      ))}
    </motion.div>
  )
}

function FeatureTile({
  progress,
  range,
  index,
  total,
  icon: Icon,
  title,
}: {
  progress: MotionValue<number>
  range: readonly [number, number]
  index: number
  total: number
  icon: typeof Calendar
  title: string
}) {
  const [start, end] = range
  const stagger = (end - start) * 0.08
  const tileStart = start + index * stagger
  const tileEnter = Math.min(tileStart + stagger * 1.4, end)
  const tileExitStart = Math.max(end - stagger, tileEnter)

  const opacity = useTransform(progress, [tileStart, tileEnter, tileExitStart, end], [0, 1, 1, 0.4])
  const y = useTransform(progress, [tileStart, tileEnter], [18, 0])

  return (
    <motion.div
      className="flex flex-col items-center justify-center gap-1.5 self-center rounded-lg border border-border bg-background/90 p-2 text-center shadow-md backdrop-blur"
      style={{ opacity, y }}
    >
      <Icon className="size-4 text-primary sm:size-5" aria-hidden="true" />
      <span className="text-[10px] font-medium leading-tight text-foreground sm:text-xs">{title}</span>
    </motion.div>
  )
}

function BenefitsOverlay() {
  return (
    <div className="rounded-xl border border-primary/30 bg-background/85 px-5 py-3 text-center shadow-lg backdrop-blur">
      <p className="text-sm font-semibold text-foreground sm:text-base">{marketing.benefits.title}</p>
    </div>
  )
}

function PartnersOverlay() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-primary/30 bg-background/85 px-5 py-4 text-center shadow-lg backdrop-blur">
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="size-1.5 rounded-full bg-primary/50" />
        ))}
      </div>
      <p className="text-xs font-medium text-muted-foreground sm:text-sm">Testé sur le terrain</p>
    </div>
  )
}

function BetaOverlay() {
  return (
    <div className="rounded-xl border border-primary/30 bg-background/85 px-5 py-3 text-center shadow-lg backdrop-blur">
      <p className="text-sm font-semibold text-foreground sm:text-base">{marketing.beta.badge}</p>
    </div>
  )
}
