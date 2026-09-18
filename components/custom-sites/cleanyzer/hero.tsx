"use client"

/**
 * HERO CLEANYZER (maquette Phase 1).
 * Architecture vidéo prête (cahier §4) : la vidéo finale sera fournie plus tard.
 * Ici, placeholder réaliste = poster optimisé + overlay sombre + contenu. Le
 * balisage <video> conserve autoplay/muted/loop/playsInline/poster + fallback
 * image ; `prefers-reduced-motion` neutralise l'autoplay.
 *
 * Preuve sociale Google : note et nombre d'avis NON fournis dans le cahier →
 * jamais hardcodés (brief §4). On affiche un état "à confirmer" honnête.
 */

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Star } from "lucide-react"
import { BRAND } from "./content"
import { CLZ_PREVIEW_BASE } from "./tokens"

const POSTER = "/custom-sites/cleanyzer/hero-poster.png"
const LOGO = "/custom-sites/cleanyzer/logo.png"

export function CleanyzerHero() {
  return (
    <section className="clz-dark relative isolate overflow-hidden">
      {/* Placeholder vidéo : poster plein cadre. Le <video> final réutilisera ce poster. */}
      <div className="absolute inset-0 -z-10">
        <Image
          src={POSTER || "/placeholder.svg"}
          alt="Détaillage automobile CLEANYZER à domicile près d'Annecy"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* Overlay sombre suffisant pour la lisibilité (cahier §4). */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/55 to-black/85" />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-transparent to-[rgba(10,132,255,0.28)]" />
      </div>

      {/* Filigrane logo très subtil */}
      <Image
        src={LOGO || "/placeholder.svg"}
        alt=""
        aria-hidden
        width={820}
        height={190}
        className="clz-watermark -right-16 top-24 w-[min(80%,640px)]"
      />

      <div className="relative mx-auto flex min-h-[92vh] max-w-6xl flex-col justify-center px-4 py-24 md:px-6">
        <span className="clz-eyebrow">
          {BRAND.name} — {BRAND.area}
        </span>
        <h1 className="clz-display clz-h1 mt-5 max-w-3xl text-balance text-white">
          Le détail fait toute <span className="clz-gold">la différence.</span>
        </h1>
        <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-[var(--clz-on-dark-muted)]">
          {BRAND.subtitle} Pour votre véhicule ou votre mobilier, un rendu premium
          sans quitter votre domicile.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link href={`${CLZ_PREVIEW_BASE}#prestations`} className="clz-btn clz-btn-primary !px-7 !py-4 !text-base">
            Découvrir nos prestations
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href={`${CLZ_PREVIEW_BASE}/demande`} className="clz-btn clz-btn-ghost !px-7 !py-4 !text-base">
            Demander un devis
          </Link>
        </div>

        {/* Preuve sociale : structure prête, valeurs à confirmer (jamais inventées). */}
        <div className="mt-12 flex items-center gap-3">
          <div className="flex" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-[var(--clz-gold)] text-[var(--clz-gold)]" />
            ))}
          </div>
          <p className="text-sm text-[var(--clz-on-dark-muted)]">
            Avis Google vérifiés — <span className="text-white/80">note et nombre à confirmer</span>
          </p>
        </div>
      </div>

      {/* Chip placeholder vidéo, discret */}
      <span className="absolute bottom-4 right-4 z-10 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[11px] font-medium text-white/70 backdrop-blur">
        Emplacement vidéo — poster de démonstration
      </span>
    </section>
  )
}
