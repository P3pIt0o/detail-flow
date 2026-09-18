/**
 * Pages éditoriales CLEANYZER (maquette Phase 1) : Réalisations, À propos,
 * Tarifs, FAQ. Contenu fondé sur le cahier ; aucune donnée inventée.
 * À propos : « Tom » uniquement (cahier §1) — pas de nom de famille.
 */

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Check, Quote } from "lucide-react"
import { BeforeAfterSlider } from "@/components/before-after-slider"
import { CleanyzerShell } from "./site-shell"
import { PageHero } from "./page-primitives"
import { CleanyzerFaq } from "./faq"
import { CLZ_NAV_ITEMS } from "./nav"
import { CLZ_PREVIEW_BASE } from "./tokens"
import {
  BRAND,
  INTERIEUR_FORMULAS,
  EXTERIEUR_FORMULAS,
  INTERIEUR_OPTIONS,
  EXTERIEUR_OPTIONS,
  TEXTILE_ITEMS,
  TEXTILE_SUPPLEMENTS,
  TEXTILE_BASE,
  TRAVEL,
  VEHICLES,
  type Formula,
  type Option,
} from "./content"

/* ---------------- Réalisations ---------------- */

// Exemples ILLUSTRATIFS de la future structure (indexable). Les vraies
// réalisations proviendront de DetailFlow — aucune donnée client inventée.
const REALISATION_EXAMPLES = [
  { title: "Nettoyage intérieur — SUV, Annecy", tag: "Intérieur", img: "/custom-sites/cleanyzer/service-interieur.png" },
  { title: "Lavage extérieur premium — Berline, Sevrier", tag: "Extérieur", img: "/custom-sites/cleanyzer/service-exterieur.png" },
  { title: "Rénovation canapé tissu — Poisy", tag: "Textile", img: "/custom-sites/cleanyzer/service-textile.png" },
]

export function RealisationsPage() {
  return (
    <CleanyzerShell navItems={CLZ_NAV_ITEMS} active="Réalisations">
      <PageHero
        eyebrow="Réalisations"
        title="Les résultats parlent d'eux-mêmes"
        intro="Comparez l'avant et l'après. Chaque réalisation deviendra une page dédiée, localisée et indexable."
        crumbs={[{ label: "Réalisations" }]}
      />

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <div className="clz-compare mx-auto max-w-3xl">
          <BeforeAfterSlider
            before="/custom-sites/cleanyzer/avant.png"
            after="/custom-sites/cleanyzer/apres.png"
            alt="Nettoyage intérieur véhicule"
          />
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {REALISATION_EXAMPLES.map((r) => (
            <article key={r.title} className="clz-card group overflow-hidden">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image src={r.img || "/placeholder.svg"} alt={r.title} fill sizes="(max-width:768px) 100vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                <span className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">{r.tag}</span>
              </div>
              <div className="p-5">
                <h3 className="font-semibold text-[var(--clz-fg)]">{r.title}</h3>
                <p className="mt-1 text-sm text-[var(--clz-muted)]">Exemple de mise en page — réalisation réelle à connecter.</p>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-6 text-xs text-[var(--clz-muted)]">
          Structure prête pour des URLs type <span className="text-[var(--clz-fg)]">/realisations/nettoyage-interieur-suv-annecy</span> (title,
          serviceType, ville, avant/après, SEO). Aucun avis ni résultat n'est inventé.
        </p>
      </section>
    </CleanyzerShell>
  )
}

/* ---------------- À propos ---------------- */

export function AProposPage() {
  const values = [
    "Un rendu premium, sans compromis sur le détail",
    "Le service vient à vous, à domicile",
    "Des prix transparents, annoncés avant l'intervention",
    "Produits et matériel professionnels",
  ]
  return (
    <CleanyzerShell navItems={CLZ_NAV_ITEMS} active="À propos">
      <PageHero
        eyebrow="À propos"
        title="Derrière CLEANYZER, Tom."
        intro="Une exigence simple : traiter chaque véhicule et chaque mobilier comme s'ils étaient les siens."
        crumbs={[{ label: "À propos" }]}
      />
      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-14 md:grid-cols-2 md:px-6 md:py-20">
        <div className="clz-card relative min-h-[360px] overflow-hidden">
          <Image src="/custom-sites/cleanyzer/about-tom.png" alt="Tom, fondateur de CLEANYZER" fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover" />
        </div>
        <div>
          <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Le détail fait toute la différence</h2>
          <p className="mt-4 leading-relaxed text-[var(--clz-muted)]">
            {BRAND.name} est né d'une passion pour le travail bien fait. {BRAND.ownerFirstName} intervient
            à domicile autour d'Annecy pour redonner à votre véhicule et à votre mobilier un aspect
            impeccable, avec le soin d'un artisan.
          </p>
          <p className="mt-4 leading-relaxed text-[var(--clz-muted)]">
            Automobile ou textile, chaque prestation est pensée pour un résultat durable et un vrai
            confort au quotidien.
          </p>
          <ul className="mt-8 space-y-3">
            {values.map((v) => (
              <li key={v} className="flex items-start gap-3 text-[var(--clz-fg)]">
                <span className="clz-check mt-0.5 h-5 w-5"><Check className="h-3 w-3" /></span>
                {v}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={`${CLZ_PREVIEW_BASE}/reservation`} className="clz-btn clz-btn-primary">Réserver un nettoyage</Link>
            <Link href={`${CLZ_PREVIEW_BASE}/demande`} className="clz-btn clz-btn-ghost">Demande textile</Link>
          </div>
          <p className="mt-6 text-xs text-[var(--clz-muted)]">Éléments biographiques précis : à confirmer avec Tom (aucun détail inventé).</p>
        </div>
      </section>
    </CleanyzerShell>
  )
}

/* ---------------- Tarifs ---------------- */

function priceCell(p: number | null) {
  return p == null ? "Sur mesure" : `${p} €`
}

function PriceMatrix({ title, formulas }: { title: string; formulas: Formula[] }) {
  return (
    <div className="clz-card overflow-hidden">
      <div className="border-b border-[var(--clz-line)] bg-[var(--clz-surface-2)] px-5 py-4">
        <h3 className="clz-display text-lg font-semibold text-[var(--clz-fg)]">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[var(--clz-line)] text-left">
              <th className="px-5 py-3 font-medium text-[var(--clz-muted)]">Formule</th>
              {VEHICLES.map((v) => (
                <th key={v.key} className="px-3 py-3 text-right font-medium text-[var(--clz-muted)]">{v.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {formulas.map((f) => (
              <tr key={f.key} className="border-b border-[var(--clz-line)] align-top last:border-0">
                <td className="px-5 py-4">
                  <span className="font-semibold text-[var(--clz-fg)]">{f.name}</span>
                  <span className="mt-1 block max-w-md text-xs leading-relaxed text-[var(--clz-muted)]">{f.content}</span>
                </td>
                {VEHICLES.map((v) => (
                  <td key={v.key} className="whitespace-nowrap px-3 py-4 text-right font-semibold text-[var(--clz-fg)]">{priceCell(f.prices[v.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OptionList({ title, options }: { title: string; options: Option[] }) {
  return (
    <div>
      <h3 className="clz-display text-lg font-semibold text-[var(--clz-fg)]">{title}</h3>
      <ul className="mt-4 divide-y divide-[var(--clz-line)] border-y border-[var(--clz-line)]">
        {options.map((o) => (
          <li key={o.key} className="flex items-start justify-between gap-4 py-3">
            <span className="text-[var(--clz-fg)]">
              {o.label}
              {o.note && <span className="block text-xs text-[var(--clz-muted)]">{o.note}</span>}
            </span>
            <span className="whitespace-nowrap font-semibold text-[var(--clz-fg)]">{o.priceLabel ?? `${o.price} €`}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TarifsPage() {
  return (
    <CleanyzerShell navItems={CLZ_NAV_ITEMS} active="Prestations">
      <PageHero
        eyebrow="Tarifs"
        title="Tarifs CLEANYZER"
        intro="Barème clair par gabarit de véhicule. Le total exact, options et déplacement compris, s'affiche dans le configurateur."
        crumbs={[{ label: "Tarifs" }]}
      />
      <section className="mx-auto max-w-6xl space-y-10 px-4 py-14 md:px-6 md:py-20">
        <PriceMatrix title="Automobile — Intérieur" formulas={INTERIEUR_FORMULAS} />
        <PriceMatrix title="Automobile — Extérieur" formulas={EXTERIEUR_FORMULAS} />

        <div className="grid gap-10 md:grid-cols-2">
          <OptionList title="Options intérieures" options={INTERIEUR_OPTIONS} />
          <OptionList title="Suppléments extérieur" options={EXTERIEUR_OPTIONS} />
        </div>

        {/* Textile */}
        <div className="clz-card overflow-hidden">
          <div className="border-b border-[var(--clz-line)] bg-[var(--clz-surface-2)] px-5 py-4">
            <h3 className="clz-display text-lg font-semibold text-[var(--clz-fg)]">Textile & mobilier</h3>
            <p className="mt-1 text-sm text-[var(--clz-muted)]">Base : {TEXTILE_BASE}</p>
          </div>
          <ul>
            {TEXTILE_ITEMS.map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-4 border-b border-[var(--clz-line)] px-5 py-3 last:border-0">
                <span className="text-[var(--clz-fg)]">{t.label}{t.hint ? <span className="block text-xs text-[var(--clz-muted)]">{t.hint}</span> : null}</span>
                <span className="whitespace-nowrap font-semibold text-[var(--clz-fg)]">{t.priceLabel}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {TEXTILE_SUPPLEMENTS.map((s) => (
              <span key={s.label} className="rounded-full border border-[var(--clz-line)] px-3 py-1.5 text-sm text-[var(--clz-fg)]">
                {s.label} <span className="text-[var(--clz-blue)]">{s.priceLabel}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Déplacement */}
        <div className="clz-card border-l-2 border-l-[var(--clz-blue)] p-6">
          <h3 className="clz-display text-lg font-semibold text-[var(--clz-fg)]">Déplacement</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-[var(--clz-muted)]">
            <li><strong className="text-[var(--clz-fg)]">{TRAVEL.includedKmOneWay} km à l'aller inclus</strong> autour d'Annecy ({TRAVEL.includedKmRoundTrip} km A/R).</li>
            <li>Au-delà : <strong className="text-[var(--clz-fg)]">{TRAVEL.pricePerExtraKm} € / km supplémentaire</strong> parcouru (ex. +5 km aller = +10 € A/R).</li>
            <li>{TRAVEL.daysLabel}, {TRAVEL.hoursLabel}.</li>
          </ul>
          <p className="mt-3 text-xs text-[var(--clz-muted)]">Durées des prestations : à confirmer dans DetailFlow — aucune durée estimée. « Sur mesure » = devis, jamais de prix automatique.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={`${CLZ_PREVIEW_BASE}/reservation`} className="clz-btn clz-btn-primary">Réserver un nettoyage auto <ArrowRight className="h-4 w-4" /></Link>
          <Link href={`${CLZ_PREVIEW_BASE}/demande`} className="clz-btn clz-btn-ghost">Demander un devis textile</Link>
        </div>
      </section>
    </CleanyzerShell>
  )
}

/* ---------------- FAQ ---------------- */

export function FaqPage() {
  return (
    <CleanyzerShell navItems={CLZ_NAV_ITEMS} active="Questions fréquentes">
      <PageHero
        eyebrow="Questions fréquentes"
        title="Vos questions, nos réponses"
        intro="Tarifs, zone, déplacement, réservation : l'essentiel avant de réserver."
        crumbs={[{ label: "FAQ" }]}
      />
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <CleanyzerFaq />
        <div className="mx-auto mt-12 max-w-3xl">
          <div className="clz-card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Quote className="h-6 w-6 flex-none text-[var(--clz-blue)]" />
              <p className="text-[var(--clz-fg)]">Une question spécifique ? Faites une demande, on vous répond avec un devis adapté.</p>
            </div>
            <Link href={`${CLZ_PREVIEW_BASE}/demande`} className="clz-btn clz-btn-primary shrink-0">Nous contacter</Link>
          </div>
        </div>
      </section>
    </CleanyzerShell>
  )
}
