/**
 * Section « Pourquoi Rozan ? » — 4 arguments maximum, très visuel, sans pavés.
 * L'argument commercial clé (nous venons à vous + autonomie eau/électricité)
 * est mis en avant.
 */

import { Truck, Droplets, Sparkles, Star } from "lucide-react"
import { ROZAN_SECTIONS } from "./tokens"

const REASONS = [
  {
    icon: Truck,
    title: "Nous venons jusqu'à vous",
    text: "Vous ne vous déplacez pas. Nous intervenons chez vous, sur votre place de parking ou dans votre garage.",
  },
  {
    icon: Droplets,
    title: "Autonomes en eau & électricité",
    text: "Rien à préparer, rien à brancher. Nous arrivons entièrement équipés et indépendants.",
  },
  {
    icon: Sparkles,
    title: "Équipement professionnel",
    text: "Injection-extraction, vapeur et produits adaptés à chaque matière pour un résultat en profondeur.",
  },
  {
    icon: Star,
    title: "Des clients satisfaits",
    text: "Une note Google parfaite et des dizaines d'avis 5 étoiles pour un service soigné et ponctuel.",
  },
] as const

export function RozanPourquoi() {
  return (
    <section id={ROZAN_SECTIONS.pourquoi} className="bg-[var(--rozan-surface)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16">
          <div className="lg:sticky lg:top-28">
            <span className="rozan-rule" />
            <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">Pourquoi Rozan ?</h2>
            <p className="mt-3 text-pretty text-[var(--rozan-muted)]">
              Un service pensé pour être simple pour vous et impeccable pour vos surfaces.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {REASONS.map((r) => (
              <div
                key={r.title}
                className="rounded-2xl border border-[color:var(--rozan-line)] bg-[var(--rozan-bg)] p-6"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-[var(--rozan-accent-soft)] text-[var(--rozan-accent)]">
                  <r.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="rozan-title mt-4 text-lg text-[var(--rozan-fg)]">{r.title}</h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--rozan-muted)]">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
