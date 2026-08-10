"use client"

/**
 * `DetailFlowPanel` — l'UNIQUE objet 3D persistant de la scène immersive.
 *
 * Monté une seule fois par `ScrollStage`, jamais démonté. Entièrement piloté
 * par la timeline globale (`progress`). Met en scène une véritable "caméra"
 * qui avance dans l'univers DetailFlow :
 *
 *  ACTE 1 (hero)     : dashboard en profondeur, incliné, halo — on ARRIVE.
 *  ACTE 2 (overview) : des fenêtres (agenda, tableur, emails, clients, devis,
 *                      factures) dispersées en profondeur CONVERGENT et sont
 *                      absorbées dans le dashboard — « centralisez ».
 *  ACTE 3 (features) : 3 moments — une fenêtre sort du dashboard, passe devant
 *                      la caméra, puis y retourne (réservation, planning, devis).
 *  ACTE 4 (finale)   : tout est réintégré, vue frontale complète, puis le
 *                      dashboard RECULE dans la profondeur et le halo s'éteint.
 *
 * Purement décoratif : `pointer-events: none` sur tout l'arbre.
 */

import Image from "next/image"
import { motion, useTransform, type MotionValue } from "framer-motion"
import { Calendar, FileText, Mail, Table2, Users } from "lucide-react"
import { STAGE_RANGE, subRange, keyframes, stageFade } from "./scroll-timeline"
import { DashboardWindow, CROP_REGIONS } from "./dashboard-window"

/** Applique le facteur de profondeur autour d'une baseline (mobile = plus doux). */
function depthScale(raw: MotionValue<number>, depth: MotionValue<number>, baseline = 0) {
  return useTransform([raw, depth], (v) => {
    const [value, factor] = v as [number, number]
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
  // --- Caméra globale : translateZ (dolly) + inclinaison + dérive ----------
  // Points en fractions absolues de toute la timeline (0..1).
  const camZraw = useTransform(
    progress,
    [0, 0.16, 0.34, 0.62, 0.82, 1],
    // négatif = loin ; positif = proche de la caméra
    [-520, -120, -30, 120, 40, -680],
  )
  const camRotXraw = useTransform(progress, [0, 0.16, 0.34, 0.82, 1], [16, 7, 2, 1, 10])
  const camRotYraw = useTransform(progress, [0, 0.16, 0.42, 0.7, 1], [-13, -4, 6, -3, 0])
  const camXraw = useTransform(progress, [0, 0.34, 0.5, 0.7, 1], [0, 0, -60, 40, 0])
  const camYraw = useTransform(progress, [0, 0.16, 0.82, 1], [40, 0, 0, -30])
  const camScaleRaw = useTransform(progress, [0, 0.16, 0.34, 0.62, 0.82, 1], [0.82, 1, 1.12, 1.18, 1.05, 0.7])

  const camZ = depthScale(camZraw, depth)
  const camRotX = depthScale(camRotXraw, depth)
  const camRotY = depthScale(camRotYraw, depth)
  const camX = depthScale(camXraw, depth)
  const camY = depthScale(camYraw, depth)
  const camScale = depthScale(camScaleRaw, depth, 1)

  // Halo : intense à l'arrivée et au climax, s'éteint à la sortie.
  const haloOpacity = useTransform(progress, [0, 0.1, 0.6, 0.85, 1], [0.35, 0.6, 0.7, 0.4, 0])
  const haloScale = useTransform(progress, [0, 0.5, 1], [0.9, 1.15, 0.7])

  // Le dashboard principal : opacité (léger fondu de sortie tout à la fin).
  const dashOpacity = useTransform(progress, [0, 0.04, 0.94, 1], [0, 1, 1, 0.15])

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      {/* Halo de profondeur (plan le plus lointain) */}
      <motion.div
        className="absolute h-[70vmin] w-[70vmin] rounded-full bg-primary/30 blur-3xl"
        style={{ opacity: haloOpacity, scale: haloScale }}
      />

      {/* Univers 3D : perspective partagée */}
      <div
        className="relative h-full w-full"
        style={{ perspective: 1500, perspectiveOrigin: "50% 45%" }}
      >
        <motion.div
          className="absolute inset-0 will-change-transform"
          style={{
            transformStyle: "preserve-3d",
            x: camX,
            y: camY,
            z: camZ,
            rotateX: camRotX,
            rotateY: camRotY,
            scale: camScale,
          }}
        >
          {/* Plan principal : le dashboard, centré */}
          <motion.div
            className="absolute left-1/2 top-1/2 w-[min(78vw,900px)] -translate-x-1/2 -translate-y-1/2"
            style={{ opacity: dashOpacity, transformStyle: "preserve-3d" }}
          >
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/25">
              <Image
                src="/marketing/dashboard-preview.png"
                alt=""
                width={1600}
                height={1000}
                priority
                className="h-auto w-full"
              />
            </div>
          </motion.div>

          {/* Couche outils dispersés → convergence (acte overview) */}
          <ConvergingTools progress={progress} depth={depth} />

          {/* Couche fenêtres fonctionnalités (acte features) */}
          <FeatureWindows progress={progress} depth={depth} />
        </motion.div>
      </div>
    </div>
  )
}

/* ========================================================================== */
/*  ACTE 2 — « Un seul outil » : les outils épars convergent vers le centre   */
/* ========================================================================== */

const TOOLS = [
  { icon: Calendar, label: "Agenda", from: { x: -46, y: -30, z: 220, r: -14 } },
  { icon: Table2, label: "Tableur", from: { x: 44, y: -34, z: 160, r: 12 } },
  { icon: Mail, label: "Relances", from: { x: -52, y: 20, z: 120, r: -8 } },
  { icon: Users, label: "Clients", from: { x: 50, y: 24, z: 240, r: 10 } },
  { icon: FileText, label: "Devis", from: { x: -30, y: 40, z: 80, r: -6 } },
  { icon: FileText, label: "Factures", from: { x: 30, y: -46, z: 300, r: 8 } },
] as const

function ConvergingTools({ progress, depth }: { progress: MotionValue<number>; depth: MotionValue<number> }) {
  const range = STAGE_RANGE.overview
  // Groupe visible sur l'acte overview seulement.
  const groupOpacity = useTransform(progress, stageFade(range, 0.18).input, stageFade(range, 0.18).output)

  return (
    <motion.div
      className="absolute inset-0"
      style={{ opacity: groupOpacity, transformStyle: "preserve-3d" }}
    >
      {TOOLS.map((tool) => (
        <ConvergingTool key={tool.label} tool={tool} range={range} progress={progress} depth={depth} />
      ))}
    </motion.div>
  )
}

function ConvergingTool({
  tool,
  range,
  progress,
  depth,
}: {
  tool: (typeof TOOLS)[number]
  range: readonly [number, number]
  progress: MotionValue<number>
  depth: MotionValue<number>
}) {
  const { from } = tool
  // De dispersé (début) → absorbé au centre (fin de l'acte).
  const xRaw = useTransform(progress, keyframes(range, [[0.15, from.x], [0.72, 0]]).input, keyframes(range, [[0.15, from.x], [0.72, 0]]).output)
  const yRaw = useTransform(progress, keyframes(range, [[0.15, from.y], [0.72, 0]]).input, keyframes(range, [[0.15, from.y], [0.72, 0]]).output)
  const zRaw = useTransform(progress, keyframes(range, [[0.15, from.z], [0.72, -20]]).input, keyframes(range, [[0.15, from.z], [0.72, -20]]).output)
  const rot = useTransform(progress, keyframes(range, [[0.15, from.r], [0.72, 0]]).input, keyframes(range, [[0.15, from.r], [0.72, 0]]).output)
  const opacity = useTransform(progress, keyframes(range, [[0.05, 0], [0.2, 1], [0.62, 1], [0.78, 0]]).input, keyframes(range, [[0.05, 0], [0.2, 1], [0.62, 1], [0.78, 0]]).output)

  const x = useTransform([xRaw, depth], (v) => (v[0] as number) * (0.5 + 0.5 * (v[1] as number)))
  const y = useTransform([yRaw, depth], (v) => (v[0] as number) * (0.5 + 0.5 * (v[1] as number)))
  const z = useTransform([zRaw, depth], (v) => (v[0] as number) * (v[1] as number))

  const Icon = tool.icon
  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{
        translateX: useTransform(x, (v) => `calc(-50% + ${v}%)`),
        translateY: useTransform(y, (v) => `calc(-50% + ${v}%)`),
        z,
        rotateZ: rot,
        opacity,
      }}
    >
      <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/90 px-3 py-2 shadow-xl backdrop-blur">
        <Icon className="size-4 text-primary sm:size-5" />
        <span className="text-xs font-medium text-foreground sm:text-sm">{tool.label}</span>
      </div>
    </motion.div>
  )
}

/* ========================================================================== */
/*  ACTE 3 — Fonctionnalités : 3 moments, une fenêtre sort, passe, revient    */
/* ========================================================================== */

const FEATURE_SCENES = [
  { label: "Réservation en ligne", region: CROP_REGIONS.appointments, side: -1 },
  { label: "Planning & tableau de bord", region: CROP_REGIONS.revenueChart, side: 1 },
  { label: "Devis & factures", region: CROP_REGIONS.stats, side: -1 },
] as const

/** Libellés des « moments » fonctionnalités, consommés par les légendes du ScrollStage. */
export const FEATURE_SCENE_LABELS = FEATURE_SCENES.map((s) => s.label)

function FeatureWindows({ progress, depth }: { progress: MotionValue<number>; depth: MotionValue<number> }) {
  const range = STAGE_RANGE.features
  return (
    <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
      {FEATURE_SCENES.map((scene, i) => {
        const from = i / FEATURE_SCENES.length
        const to = (i + 1) / FEATURE_SCENES.length
        return (
          <FeatureWindow
            key={scene.label}
            scene={scene}
            range={subRange(range, from, to)}
            progress={progress}
            depth={depth}
          />
        )
      })}
    </div>
  )
}

function FeatureWindow({
  scene,
  range,
  progress,
  depth,
}: {
  scene: (typeof FEATURE_SCENES)[number]
  range: readonly [number, number]
  progress: MotionValue<number>
  depth: MotionValue<number>
}) {
  // z : dans le dashboard (négatif) → devant la caméra (positif) → retour.
  const zPts = keyframes(range, [[0.0, -40], [0.5, 260], [1, -40]])
  const zRaw = useTransform(progress, zPts.input, zPts.output)
  const z = depthScale(zRaw, depth)

  const xPts = keyframes(range, [[0.0, scene.side * 6], [0.5, scene.side * 22], [1, scene.side * 6]])
  const xRaw = useTransform(progress, xPts.input, xPts.output)
  const x = useTransform([xRaw, depth], (v) => (v[0] as number) * (0.55 + 0.45 * (v[1] as number)))

  const rotPts = keyframes(range, [[0.0, scene.side * 10], [0.5, scene.side * -4], [1, scene.side * 10]])
  const rotY = depthScale(useTransform(progress, rotPts.input, rotPts.output), depth)

  const opPts = keyframes(range, [[0.02, 0], [0.16, 1], [0.84, 1], [0.98, 0]])
  const opacity = useTransform(progress, opPts.input, opPts.output)

  return (
    <motion.div
      className="absolute left-1/2 top-1/2 w-[min(60vw,420px)]"
      style={{
        translateX: useTransform(x, (v) => `calc(-50% + ${v}vw)`),
        translateY: "-50%",
        z,
        rotateY: rotY,
        opacity,
        transformStyle: "preserve-3d",
      }}
    >
      <DashboardWindow label={scene.label} region={scene.region} accent />
    </motion.div>
  )
}

