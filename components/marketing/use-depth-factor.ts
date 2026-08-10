"use client"

/**
 * Facteur de profondeur global de la scène 3D, adapté à la taille d'écran.
 *
 * - Desktop large : profondeur pleine (1).
 * - Laptop : légèrement réduite.
 * - Tablette / mobile : 2.5D simplifiée (amplitude nettement réduite) pour
 *   une expérience fluide et lisible, sans effet 3D lourd.
 *
 * Renvoie une `MotionValue<number>` mise à jour au resize (dans un effet,
 * post-montage) afin de ne pas créer de mismatch d'hydratation.
 */

import { useEffect } from "react"
import { useMotionValue, type MotionValue } from "framer-motion"

const DESKTOP_DEPTH = 1
const LAPTOP_DEPTH = 0.82
const TABLET_DEPTH = 0.58
const MOBILE_DEPTH = 0.4

function depthForWidth(width: number): number {
  if (width >= 1280) return DESKTOP_DEPTH
  if (width >= 1024) return LAPTOP_DEPTH
  if (width >= 640) return TABLET_DEPTH
  return MOBILE_DEPTH
}

export function useDepthFactor(): MotionValue<number> {
  // Valeur initiale stable (identique SSR/CSR) ; ajustée après montage.
  const depth = useMotionValue(DESKTOP_DEPTH)

  useEffect(() => {
    const update = () => depth.set(depthForWidth(window.innerWidth))
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [depth])

  return depth
}
