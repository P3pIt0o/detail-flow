"use client"

/**
 * `DashboardWindow` — une "fenêtre" flottante représentant une partie réelle
 * de l'interface DetailFlow. Deux modes :
 *
 * - `crop` : montre une région réelle de la capture `dashboard-preview.png`
 *   (via un cadrage par `object-position` + `scale`), pour utiliser de
 *   véritables morceaux du produit plutôt que des maquettes inventées.
 * - `children` : contenu personnalisé (mini-UI reconstruite) quand un crop
 *   ne suffit pas.
 *
 * Purement décoratif (`aria-hidden`), jamais interactif.
 */

import Image from "next/image"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Régions approximatives de `dashboard-preview.png` (1024x1024), exprimées en
 * pourcentages, pour cadrer une zone précise du produit.
 */
export type CropRegion = {
  /** object-position horizontal (%) */
  x: number
  /** object-position vertical (%) */
  y: number
  /** facteur de zoom (l'image est agrandie puis recadrée) */
  zoom: number
}

export const CROP_REGIONS = {
  stats: { x: 50, y: 20, zoom: 2.1 },
  revenueChart: { x: 50, y: 42, zoom: 1.7 },
  appointments: { x: 50, y: 78, zoom: 1.7 },
  sidebar: { x: 6, y: 45, zoom: 2.3 },
} satisfies Record<string, CropRegion>

export function DashboardWindow({
  label,
  region,
  children,
  className,
  accent = false,
}: {
  label?: string
  region?: CropRegion
  children?: ReactNode
  className?: string
  accent?: boolean
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-2xl backdrop-blur",
        accent ? "border-primary/50 shadow-primary/25" : "border-border/80 shadow-black/40",
        className,
      )}
    >
      {label ? (
        <div className="flex items-center gap-1.5 border-b border-border/60 bg-background/70 px-3 py-1.5">
          <span className="size-2 rounded-full bg-primary/70" />
          <span className="truncate text-[11px] font-medium text-muted-foreground">{label}</span>
        </div>
      ) : null}

      {region ? (
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          <Image
            src="/marketing/dashboard-preview.png"
            alt=""
            fill
            sizes="(max-width: 640px) 60vw, 30vw"
            className="object-cover"
            style={{
              objectPosition: `${region.x}% ${region.y}%`,
              transform: `scale(${region.zoom})`,
              transformOrigin: `${region.x}% ${region.y}%`,
            }}
          />
        </div>
      ) : (
        <div className="p-3">{children}</div>
      )}
    </div>
  )
}
