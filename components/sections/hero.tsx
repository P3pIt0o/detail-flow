"use client"

/**
 * Section HERO de la page d'accueil.
 * - Image de fond premium avec dégradé assombri pour la lisibilité.
 * - Titre, sous-titre et CTA animés à l'apparition (Framer Motion).
 * - Indicateurs de confiance (note, véhicules traités).
 */

import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowRight, ShieldCheck } from "lucide-react"
import { withTenant } from "@/lib/tenant-link"

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}
const item = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
}

/** Contenu éditable du Hero (par tenant). Chaque champ null → fallback neutre. */
type HeroContent = {
  title: string | null
  highlight: string | null
  subtitle: string | null
  ctaPrimary: string | null
  ctaSecondary: string | null
}

type HeroProps = {
  /** Nom commercial du tenant courant, affiché dans le badge. Fallback neutre si absent. */
  brandName?: string | null
  /** Textes personnalisés du tenant courant (base de données). */
  hero?: HeroContent | null
  /** Image de fond résolue côté serveur (slug tenant). Repli sur "/hero.png". */
  imageSrc?: string
}

// Valeurs par défaut NEUTRES (aucune donnée commerciale spécifique à un tenant).
const HERO_DEFAULTS = {
  title: "Prenez soin de votre véhicule",
  highlight: "véhicule",
  subtitle:
    "Des prestations de detailing réalisées avec passion et exigence. Réservez facilement en ligne et profitez d’un service professionnel adapté à vos besoins.",
  ctaPrimary: "Réserver",
  ctaSecondary: "Voir les prestations",
} as const

/**
 * Rend le titre en mettant en couleur la portion `highlight` si elle est
 * présente dans le titre. Sinon, affiche le titre tel quel (pas de couleur
 * forcée), pour rester robuste quel que soit le texte saisi par l'admin.
 */
function renderTitle(title: string, highlight: string | null) {
  const h = (highlight ?? "").trim()
  if (!h) return title
  const idx = title.toLowerCase().indexOf(h.toLowerCase())
  if (idx === -1) return title
  return (
    <>
      {title.slice(0, idx)}
      <span className="text-primary">{title.slice(idx, idx + h.length)}</span>
      {title.slice(idx + h.length)}
    </>
  )
}

export function Hero({ brandName, hero, imageSrc }: HeroProps) {
  const tenant = useSearchParams().get("tenant")
  const title = hero?.title?.trim() || HERO_DEFAULTS.title
  const highlight = hero?.title?.trim() ? hero?.highlight ?? null : HERO_DEFAULTS.highlight
  const subtitle = hero?.subtitle?.trim() || HERO_DEFAULTS.subtitle
  const ctaPrimary = hero?.ctaPrimary?.trim() || HERO_DEFAULTS.ctaPrimary
  const ctaSecondary = hero?.ctaSecondary?.trim() || HERO_DEFAULTS.ctaSecondary
  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden">
      {/* Arrière-plan */}
      <div className="absolute inset-0 -z-10">
        <Image src={imageSrc?.trim() || "/hero.png"} alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pt-24 sm:px-6 lg:px-8">
        <motion.div variants={container} initial="hidden" animate="visible" className="max-w-2xl">
          <motion.span
            variants={item}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur"
          >
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            {brandName || "Detailing automobile"}
          </motion.span>

          <motion.h1
            variants={item}
            className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl"
          >
            {renderTitle(title, highlight)}
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground"
          >
            {subtitle}
          </motion.p>
          <motion.div variants={item} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={withTenant("/reservation", tenant)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:bg-primary/90 hover:shadow-primary/50"
            >
              {ctaPrimary}
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
            <Link
              href={withTenant("/prestations", tenant)}
              className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card/50 px-8 text-base font-semibold text-foreground backdrop-blur transition-colors hover:border-primary/50"
            >
              {ctaSecondary}
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
