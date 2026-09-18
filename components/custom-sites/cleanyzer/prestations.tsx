/**
 * Vues Prestations CLEANYZER (maquette Phase 1).
 * Tous les tarifs / contenus proviennent EXACTEMENT du cahier (§5-8).
 * Diamond & "Sur devis" → jamais de prix fabriqué : CTA vers la demande adaptée.
 */

import Link from "next/link"
import Image from "next/image"
import { Check, ArrowRight } from "lucide-react"
import { CleanyzerShell } from "./site-shell"
import { PageHero, DirectAnswer } from "./page-primitives"
import { CLZ_NAV_ITEMS } from "./nav"
import { CLZ_PREVIEW_BASE } from "./tokens"
import {
  VEHICLES,
  formulasFor,
  optionsFor,
  TEXTILE_BASE,
  TEXTILE_ITEMS,
  TEXTILE_SUPPLEMENTS,
  type CleaningKind,
  type Formula,
} from "./content"

function priceCell(p: number | null) {
  return p == null ? "Sur mesure" : `${p} €`
}

function FormulaCard({ f }: { f: Formula }) {
  const isCustom = Object.values(f.prices).every((p) => p == null)
  return (
    <article className={`clz-card relative flex flex-col p-6 ${f.highlight ? "ring-1 ring-[var(--clz-blue)]" : ""}`}>
      {f.highlight && (
        <span className={`clz-badge absolute -top-3 left-6 ${f.highlight === "best-seller" ? "clz-badge-gold" : "clz-badge-blue"}`}>
          {f.highlight === "best-seller" ? "Best seller" : "Populaire"}
        </span>
      )}
      <h3 className="clz-display clz-h3 text-[var(--clz-fg)]">{f.name}</h3>
      <p className="mt-3 min-h-[3.5rem] text-sm leading-relaxed text-[var(--clz-muted)]">{f.content}</p>

      <dl className="mt-5 space-y-1.5 border-t border-[var(--clz-line)] pt-4">
        {VEHICLES.map((v) => (
          <div key={v.key} className="flex items-center justify-between text-sm">
            <dt className="text-[var(--clz-muted)]">{v.label}</dt>
            <dd className="font-semibold text-[var(--clz-fg)]">{priceCell(f.prices[v.key])}</dd>
          </div>
        ))}
      </dl>

      <Link
        href={isCustom ? `${CLZ_PREVIEW_BASE}/demande` : `${CLZ_PREVIEW_BASE}/reservation`}
        className={`clz-btn mt-6 w-full ${isCustom ? "clz-btn-ghost" : "clz-btn-primary"}`}
      >
        {isCustom ? "Demander un devis sur mesure" : "Réserver cette formule"}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  )
}

export function AutoPrestationView({ kind }: { kind: CleaningKind }) {
  const formulas = formulasFor(kind)
  const options = optionsFor(kind)
  const label = kind === "interieur" ? "intérieur" : "extérieur"
  const minPrice = Math.min(
    ...formulas.flatMap((f) => Object.values(f.prices).filter((p): p is number => p != null)),
  )
  const answer =
    kind === "interieur"
      ? "Le nettoyage intérieur démarre à 50 € (Éco citadine). La formule Premium débute à 80 € et l'Excellence à 115 €. Toutes les formules sont réalisées à domicile, autour d'Annecy."
      : "Le nettoyage extérieur démarre à 30 € (Éco citadine). La formule Excellence débute à 50 €. Prestation réalisée à votre domicile, autour d'Annecy."

  return (
    <CleanyzerShell navItems={CLZ_NAV_ITEMS} active="Prestations">
      <PageHero
        eyebrow={`Nettoyage automobile — ${label}`}
        title={`Nettoyage ${label} de voiture à Annecy`}
        intro={`Des formules claires, réservables en ligne, réalisées à votre domicile. À partir de ${minPrice} €.`}
        crumbs={[{ label: "Prestations", href: `${CLZ_PREVIEW_BASE}#prestations` }, { label: `Auto ${label}` }]}
      />

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <DirectAnswer question={`Combien coûte un nettoyage ${label} de voiture à Annecy ?`} answer={answer} />

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {formulas.map((f) => (
            <FormulaCard key={f.key} f={f} />
          ))}
        </div>
        <p className="mt-4 text-xs text-[var(--clz-muted)]">
          Prix par gabarit (Citadine / Berline / SUV) issus du barème CLEANYZER. Durées : à confirmer
          dans DetailFlow — aucune durée n'est estimée.
        </p>
      </section>

      {/* Options pertinentes uniquement */}
      <section className="bg-[var(--clz-surface-2)]">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
          <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Options {label}</h2>
          <p className="mt-3 max-w-2xl text-[var(--clz-muted)]">
            À ajouter selon vos besoins. Le total se met à jour automatiquement dans le configurateur.
          </p>
          <ul className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {options.map((o) => (
              <li key={o.key} className="flex items-start justify-between gap-4 border-b border-[var(--clz-line)] py-3">
                <span className="flex items-start gap-2.5 text-[var(--clz-fg)]">
                  <span className="clz-check mt-0.5 h-5 w-5"><Check className="h-3 w-3" /></span>
                  <span>
                    {o.label}
                    {o.note && <span className="block text-xs text-[var(--clz-muted)]">{o.note}</span>}
                  </span>
                </span>
                <span className="whitespace-nowrap font-semibold text-[var(--clz-fg)]">
                  {o.priceLabel ?? `${o.price} €`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CrossCta />
    </CleanyzerShell>
  )
}

export function TextilePrestationView() {
  return (
    <CleanyzerShell navItems={CLZ_NAV_ITEMS} active="Prestations">
      <PageHero
        eyebrow="Textile & mobilier"
        title="Nettoyage de canapé, matelas et tapis à Annecy"
        intro="Le textile fait l'objet d'une demande personnalisée. Chaque prestation comprend aspiration complète, shampoing, désinfection et traitement des odeurs."
        crumbs={[{ label: "Prestations", href: `${CLZ_PREVIEW_BASE}#prestations` }, { label: "Textile" }]}
      />

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <DirectAnswer
          question="Combien coûte le nettoyage d'un canapé à Annecy ?"
          answer="Un canapé 2/3 places est à 80 €, un canapé 3/4 places (avec ou sans méridienne) à 110 €, et un canapé 5 places et plus à partir de 150 €. Matelas, tapis et moquette sont établis sur devis."
        />

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="clz-card overflow-hidden">
              <div className="border-b border-[var(--clz-line)] bg-[var(--clz-surface-2)] p-5">
                <p className="text-sm font-semibold text-[var(--clz-fg)]">Prestation de base incluse</p>
                <p className="mt-1 text-sm text-[var(--clz-muted)]">{TEXTILE_BASE}</p>
              </div>
              <ul>
                {TEXTILE_ITEMS.map((t) => (
                  <li key={t.key} className="flex items-center justify-between gap-4 border-b border-[var(--clz-line)] px-5 py-4 last:border-0">
                    <span className="text-[var(--clz-fg)]">
                      {t.label}
                      {t.hint && <span className="block text-xs text-[var(--clz-muted)]">{t.hint}</span>}
                    </span>
                    <span className="whitespace-nowrap font-semibold text-[var(--clz-fg)]">{t.priceLabel}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {TEXTILE_SUPPLEMENTS.map((s) => (
                <span key={s.label} className="rounded-full border border-[var(--clz-line)] px-3 py-1.5 text-sm text-[var(--clz-fg)]">
                  {s.label} <span className="text-[var(--clz-blue)]">{s.priceLabel}</span>
                </span>
              ))}
            </div>

            <Link href={`${CLZ_PREVIEW_BASE}/demande`} className="clz-btn clz-btn-primary mt-7">
              Obtenir mon devis textile
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="clz-card relative min-h-[320px] overflow-hidden">
            <Image src="/custom-sites/cleanyzer/service-textile.png" alt="Nettoyage de canapé à domicile" fill sizes="(max-width:1024px) 100vw, 45vw" className="object-cover" />
          </div>
        </div>
      </section>

      <CrossCta textile />
    </CleanyzerShell>
  )
}

function CrossCta({ textile }: { textile?: boolean }) {
  return (
    <section className="clz-dark">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 md:flex-row md:items-center md:px-6">
        <div>
          <h2 className="clz-display clz-h3 text-white">
            {textile ? "Un véhicule à faire nettoyer aussi ?" : "Un canapé ou un tapis à raviver ?"}
          </h2>
          <p className="mt-2 text-[var(--clz-on-dark-muted)]">
            {textile ? "Réservez un nettoyage auto en quelques étapes." : "Faites une demande personnalisée pour votre mobilier."}
          </p>
        </div>
        <Link
          href={textile ? `${CLZ_PREVIEW_BASE}/reservation` : `${CLZ_PREVIEW_BASE}/demande`}
          className="clz-btn clz-btn-primary"
        >
          {textile ? "Réserver un nettoyage auto" : "Demander un devis textile"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}
