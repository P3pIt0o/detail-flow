"use client"

/**
 * Facteur de profondeur réactif (MotionValue) : 1 sur desktop (pleine
 * profondeur 3D), réduit sur mobile pour une 2.5D simplifiée et plus légère
 * — même composant, mêmes transforms, juste une amplitude différente.
 */

import { useEffect } from "react"
import { useMotionValue, type MotionValue } from "framer-motion"

const DESKTOP_QUERY = "(min-width: 768px)"
const DESKTOP_DEPTH = 1
const MOBILE_DEPTH = 0.32

export function useDepthFactor(): MotionValue<number> {
  const depth = useMotionValue(DESKTOP_DEPTH)

  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia(DESKTOP_QUERY)
    const apply = () => depth.set(media.matches ? DESKTOP_DEPTH : MOBILE_DEPTH)
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [depth])

  return depth
}
