"use client"

/**
 * Grille de la galerie avant/après avec filtre par catégorie.
 * Composant client car il gère un état de filtre local.
 */

import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { GalleryItem } from "@/config/content"
import { BeforeAfterSlider } from "@/components/before-after-slider"
import { cn } from "@/lib/utils"

export function GalleryGrid({ items }: { items: GalleryItem[] }) {
  const categories = useMemo(() => {
    const set = Array.from(new Set(items.map((i) => i.category)))
    return ["Tous", ...set]
  }, [items])

  const [active, setActive] = useState("Tous")

  const filtered = active === "Tous" ? items : items.filter((i) => i.category === active)

  return (
    <div>
      {/* Filtres */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer par catégorie">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={active === cat}
            onClick={() => setActive(cat)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              active === cat
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grille */}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {filtered.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-3"
            >
              <BeforeAfterSlider before={item.before} after={item.after} alt={item.title} />
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">{item.title}</p>
                <span className="text-sm text-muted-foreground">{item.category}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
