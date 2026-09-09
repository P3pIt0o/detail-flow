/**
 * Section « Que voulez-vous nettoyer ? » — grandes cartes visuelles.
 *
 * La grille est alimentée par le catalogue Rozan (source unique `content.ts`,
 * chaque carte filtrée par `active`). En Phase 4, `active` viendra de l'admin du
 * tenant : activer/désactiver une prestation la fait apparaître/disparaître ici,
 * dans le footer, le sitemap et le maillage — sans toucher au code.
 */

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { RozanShot } from "./rozan-shot"
import { ROZAN_SECTIONS } from "./tokens"
import { ROZAN_SERVICES } from "./content"

export function RozanPrestations() {
  const services = ROZAN_SERVICES.filter((s) => s.active)

  return (
    <section id={ROZAN_SECTIONS.prestations} className="bg-[var(--rozan-bg)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <span className="rozan-rule" />
          <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">
            Que voulez-vous nettoyer ?
          </h2>
          <p className="mt-3 text-pretty text-[var(--rozan-muted)]">
            Un savoir-faire adapté à chaque surface et chaque matière, avec un équipement professionnel
            que nous amenons directement chez vous.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Link
              key={s.slug}
              href={`/prestations/${s.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] transition-all duration-300 hover:-translate-y-1 hover:border-[color:var(--rozan-accent)] hover:shadow-[0_20px_40px_-24px_rgba(13,95,209,0.5)]"
            >
              <RozanShot
                src={s.image}
                alt={s.alt}
                label={s.shot}
                ratio="aspect-[16/11]"
                rounded="rounded-none"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="rozan-title text-xl text-[var(--rozan-fg)]">{s.label}</h3>
                  <ArrowUpRight className="size-5 flex-none text-[var(--rozan-muted)] transition-colors group-hover:text-[var(--rozan-accent)]" aria-hidden="true" />
                </div>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--rozan-muted)]">{s.teaser}</p>
                <span className="mt-4 text-sm font-semibold text-[var(--rozan-accent)]">Voir les formules</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
