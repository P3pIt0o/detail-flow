/**
 * Section Zones d'intervention — « Rozan vient jusqu'à vous. »
 *
 * Deux ensembles visuels (Pays de Gex / Suisse). Les villes disposant d'une
 * VRAIE landing page locale (`ROZAN_LOCAL_PAGES`) deviennent des liens vers
 * cette page ; les autres restent de simples puces (aucun lien mort, le
 * parcours reste dans le tenant). En Phase 4, publier une nouvelle page locale
 * suffit à activer automatiquement le lien correspondant ici.
 */

import Link from "next/link"
import { MapPin } from "lucide-react"
import { ROZAN_SECTIONS } from "./tokens"
import { ROZAN_ZONES, ROZAN_LOCAL_PAGES } from "./content"

// Index ville (normalisée) → slug de la première page locale réelle publiée.
const CITY_TO_LOCAL_SLUG: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const page of Object.values(ROZAN_LOCAL_PAGES)) {
    const key = normalizeCity(page.city)
    if (!map[key]) map[key] = page.slug
  }
  return map
})()

function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function ZoneBlock({ label, cities, tone }: { label: string; cities: readonly string[]; tone: "france" | "suisse" }) {
  return (
    <div className="rounded-2xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] p-6 lg:p-8">
      <div className="flex items-center gap-2">
        <MapPin className="size-4 text-[var(--rozan-accent)]" aria-hidden="true" />
        <h3 className="rozan-title text-lg text-[var(--rozan-fg)]">{label}</h3>
        <span className="ml-auto rounded-full bg-[var(--rozan-accent-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--rozan-accent-strong)]">
          {tone === "france" ? "France" : "Suisse"}
        </span>
      </div>
      <ul className="mt-5 flex flex-wrap gap-2">
        {cities.map((c) => {
          const slug = CITY_TO_LOCAL_SLUG[normalizeCity(c)]
          if (slug) {
            return (
              <li key={c}>
                <Link
                  href={`/${slug}`}
                  className="inline-flex items-center rounded-full border border-[color:var(--rozan-line)] px-3.5 py-1.5 text-sm text-[var(--rozan-fg)] transition-colors hover:border-[var(--rozan-accent)] hover:text-[var(--rozan-accent)]"
                >
                  {c}
                </Link>
              </li>
            )
          }
          return (
            <li key={c}>
              <span className="inline-flex items-center rounded-full border border-[color:var(--rozan-line)] px-3.5 py-1.5 text-sm text-[var(--rozan-muted)]">
                {c}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function RozanZones() {
  return (
    <section id={ROZAN_SECTIONS.zones} className="bg-[var(--rozan-bg)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <span className="rozan-rule" />
          <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">Rozan vient jusqu&apos;à vous.</h2>
          <p className="mt-3 text-pretty text-[var(--rozan-muted)]">
            Nous intervenons dans tout le Pays de Gex et le canton de Genève, ainsi que les communes
            environnantes réellement desservies.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <ZoneBlock label={ROZAN_ZONES.france.label} cities={ROZAN_ZONES.france.cities} tone="france" />
          <ZoneBlock label={ROZAN_ZONES.suisse.label} cities={ROZAN_ZONES.suisse.cities} tone="suisse" />
        </div>
      </div>
    </section>
  )
}
