/**
 * Hero Rozan — premier écran orienté conversion (« vendre en < 3 secondes »).
 *
 * Composition premium sur fond sombre : à gauche le discours (label régional,
 * H1 fort, sous-titre, 4 arguments, 2 CTA, preuve Google) ; à droite une
 * composition photographique (emplacement `RozanShot` + carte flottante de
 * preuve). Ce n'est PAS un simple texte centré sur une image de stock.
 *
 * Sur mobile : la photo passe au-dessus, les CTA restent immédiatement
 * accessibles, tout reste très lisible.
 */

import { RozanShot } from "./rozan-shot"
import { RozanGoogleProof } from "./rozan-google-proof"
import { ROZAN_SECTIONS, ROZAN_BTN_OUTLINE_DARK } from "./tokens"
import { ROZAN_GOOGLE } from "./content"
import { Droplets, Zap, Home, Sparkles } from "lucide-react"

const ARGS = [
  { icon: Home, label: "À domicile" },
  { icon: Droplets, label: "Autonome en eau" },
  { icon: Zap, label: "Autonome en électricité" },
  { icon: Sparkles, label: "Équipement professionnel" },
] as const

export function RozanHero() {
  return (
    <section
      id={ROZAN_SECTIONS.accueil}
      className="relative overflow-hidden bg-[var(--rozan-ink)] text-white"
    >
      {/* Halo d'accent très discret (pas un blob décoratif : ancré au coin,
          purement atmosphérique, sous le contenu). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full opacity-[0.18] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--rozan-accent) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 pb-14 pt-28 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:px-8 lg:pb-24 lg:pt-36">
        {/* Discours */}
        <div>
          <p className="rozan-eyebrow inline-flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-[var(--rozan-accent)]" aria-hidden="true" />
            Pays de Gex · Genève
          </p>

          <h1 className="rozan-title rozan-h1 mt-4 text-balance text-white">
            Votre intérieur retrouve son éclat.{" "}
            <span className="text-[var(--rozan-accent)]">Sans bouger de chez vous.</span>
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
            Nettoyage professionnel de voitures, canapés, matelas et textiles directement à domicile
            dans le Pays de Gex et à Genève.
          </p>

          <ul className="mt-7 grid grid-cols-2 gap-x-6 gap-y-3 sm:max-w-md">
            {ARGS.map((a) => (
              <li key={a.label} className="flex items-center gap-2.5 text-sm text-white/85">
                <span className="rozan-check bg-white/10 text-[var(--rozan-accent)]">
                  <a.icon className="size-3.5" aria-hidden="true" />
                </span>
                {a.label}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={`#${ROZAN_SECTIONS.devis}`}
              className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[var(--rozan-accent)] px-8 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)]"
            >
              Obtenir mon devis
            </a>
            <a href={`#${ROZAN_SECTIONS.avantApres}`} className={`${ROZAN_BTN_OUTLINE_DARK} h-13`}>
              Voir les résultats
            </a>
          </div>

          <div className="mt-8">
            <RozanGoogleProof rating={ROZAN_GOOGLE.rating} count={ROZAN_GOOGLE.count} href={ROZAN_GOOGLE.url} tone="dark" />
          </div>
        </div>

        {/* Composition photographique */}
        <div className="relative">
          <RozanShot label="Photo phare Rozan — véhicule ou intérieur fraîchement nettoyé (portrait)" ratio="aspect-[4/5]" tone="dark" rounded="rounded-3xl" />

          {/* Carte flottante « preuve » (chiffre réel d'audit). */}
          <div className="absolute -bottom-5 -left-3 hidden rounded-2xl border border-white/10 bg-[var(--rozan-ink-2)] px-5 py-4 shadow-xl sm:block">
            <p className="rozan-title text-2xl text-white">{ROZAN_GOOGLE.vehiclesCleaned}+</p>
            <p className="mt-0.5 text-xs text-white/60">véhicules nettoyés avec soin</p>
          </div>
        </div>
      </div>
    </section>
  )
}
