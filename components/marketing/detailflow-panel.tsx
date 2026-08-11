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
 *  ACTE 3 (features) : 4 moments — une fenêtre (capture RÉELLE du produit) sort
 *                      du dashboard, passe devant la caméra, puis y retourne
 *                      (réservation, planning, devis client, facturation).
 *  ACTE 4 (finale)   : tout est réintégré, vue frontale complète, puis le
 *                      dashboard RECULE dans la profondeur et le halo s'éteint.
 *
 * Purement décoratif : `pointer-events: none` sur tout l'arbre.
 */

import Image from "next/image"
import { motion, useTransform, type MotionValue } from "framer-motion"
import { Calendar, FileText, Mail, Table2, Users } from "lucide-react"
import { STAGE_RANGE, subRange, keyframes, stageFade } from "./scroll-timeline"
import { DashboardWindow } from "./dashboard-window"

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
  // Au hero le dashboard est remonté (dégage le bas pour le texte), puis se
  // recentre dès le premier scroll quand on « entre » dedans.
  const camYraw = useTransform(progress, [0, 0.16, 0.82, 1], [-70, 0, 0, -30])
  const camScaleRaw = useTransform(progress, [0, 0.16, 0.34, 0.62, 0.82, 1], [0.74, 1, 1.12, 1.18, 1.05, 0.7])

  const camZ = depthScale(camZraw, depth)
  const camRotX = depthScale(camRotXraw, depth)
  const camRotY = depthScale(camRotYraw, depth)
  const camX = depthScale(camXraw, depth)
  const camY = depthScale(camYraw, depth)
  const camScale = depthScale(camScaleRaw, depth, 1)

  // Halo : intense à l'arrivée et au climax, s'éteint à la sortie.
  const haloOpacity = useTransform(progress, [0, 0.1, 0.6, 0.85, 1], [0.35, 0.6, 0.7, 0.4, 0])
  const haloScale = useTransform(progress, [0, 0.5, 1], [0.9, 1.15, 0.7])

  // Le dashboard principal : visible DÈS le chargement (en profondeur), puis
  // léger fondu de sortie tout à la fin quand il recule dans l'univers.
  const dashOpacity = useTransform(progress, [0, 0.92, 1], [1, 1, 0.12])

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

// `x` en vw, `y` en vh : les outils sont RÉELLEMENT dispersés autour du
// dashboard, sur des plans de profondeur variés (`z`), avant de converger.
const TOOLS = [
  { icon: Calendar, label: "Agenda", from: { x: -34, y: -26, z: 220, r: -14 } },
  { icon: Table2, label: "Tableur", from: { x: 33, y: -30, z: 150, r: 12 } },
  { icon: Mail, label: "Relances", from: { x: -38, y: 18, z: 110, r: -8 } },
  { icon: Users, label: "Clients", from: { x: 37, y: 22, z: 240, r: 10 } },
  { icon: FileText, label: "Devis", from: { x: -20, y: 32, z: 80, r: -6 } },
  { icon: FileText, label: "Factures", from: { x: 22, y: -38, z: 300, r: 8 } },
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

  const x = useTransform([xRaw, depth], (v) => (v[0] as number) * (0.55 + 0.45 * (v[1] as number)))
  const y = useTransform([yRaw, depth], (v) => (v[0] as number) * (0.55 + 0.45 * (v[1] as number)))
  const z = useTransform([zRaw, depth], (v) => (v[0] as number) * (v[1] as number))

  const Icon = tool.icon
  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{
        translateX: useTransform(x, (v) => `calc(-50% + ${v}vw)`),
        translateY: useTransform(y, (v) => `calc(-50% + ${v}vh)`),
        z,
        rotateZ: rot,
        opacity,
      }}
    >
      <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-background/95 px-4 py-2.5 shadow-2xl shadow-primary/20 backdrop-blur">
        <Icon className="size-5 text-primary" />
        <span className="text-sm font-semibold text-foreground">{tool.label}</span>
      </div>
    </motion.div>
  )
}

/* ========================================================================== */
/*  ACTE 3 — Fonctionnalités : 3 moments, une fenêtre sort, passe, revient    */
/* ========================================================================== */

// Chaque « moment » montre une VRAIE capture de l'interface DetailFlow
// (générée via /capture, données de démo, aucune donnée client réelle).
const FEATURE_SCENES = [
  { label: "Réservation en ligne", src: "/marketing/product/booking.png", aspect: "16 / 10", side: -1 },
  { label: "Planning", src: "/marketing/product/calendar.png", aspect: "16 / 11", side: 1 },
  { label: "Devis client", src: "/marketing/product/quote.png", aspect: "16 / 10", side: -1 },
  { label: "Facturation", src: "/marketing/product/invoice.png", aspect: "16 / 11", side: 1 },
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
      <DashboardWindow label={scene.label} src={scene.src} imageAspect={scene.aspect} accent />
    </motion.div>
  )
}

