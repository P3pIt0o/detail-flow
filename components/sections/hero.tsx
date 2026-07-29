"use client"

/**
 * Section HERO de la page d'accueil.
 * - Image de fond premium avec dégradé assombri pour la lisibilité.
 * - Titre, sous-titre et CTA animés à l'apparition (Framer Motion).
 * - Indicateurs de confiance (note, véhicules traités).
 */

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Star, ShieldCheck } from "lucide-react"
import { siteConfig } from "@/config/site"
import { about } from "@/config/content"

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}
const item = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
}

export function Hero() {
  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden">
      {/* Arrière-plan */}
      <div className="absolute inset-0 -z-10">
        <Image src="/hero.png" alt="" fill priority sizes="100vw" className="object-cover" />
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
            {siteConfig.brand.tagline}
          </motion.span>

          <motion.h1
            variants={item}
            className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl"
          >
            Redonnez vie à votre <span className="text-primary">véhicule</span>
          </motion.h1>

          <motion.p variants={item} className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Detailing automobile haut de gamme : lavage premium, rénovation carrosserie et protection céramique.
            Un service minutieux, à l&apos;atelier ou à domicile.
          </motion.p>

          <motion.div variants={item} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={siteConfig.cta.href}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:bg-primary/90 hover:shadow-primary/50"
            >
              {siteConfig.cta.label}
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
            <Link
              href="/prestations"
              className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card/50 px-8 text-base font-semibold text-foreground backdrop-blur transition-colors hover:border-primary/50"
            >
              Voir les prestations
            </Link>
          </motion.div>

          {/* Indicateurs de confiance */}
          <motion.div variants={item} className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="flex items-center gap-2">
              <div className="flex" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-4 fill-primary text-primary" />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                <strong className="text-foreground">{about.stats[2].value}</strong> de note moyenne
              </span>
            </div>
            <div className="h-8 w-px bg-border" />
            <span className="text-sm text-muted-foreground">
              <strong className="text-foreground">{about.stats[0].value}</strong> véhicules traités
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
