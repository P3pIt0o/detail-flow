/**
 * EXEMPLE de page SEO LOCALE CLEANYZER (maquette Phase 1) — /zones/annecy.
 *
 * Démontre l'architecture locale (cahier §16) : réponses directes (GEO §19),
 * services + prix réels, contenu local, FAQ localisée, maillage interne. Une
 * page locale ne devient indexable qu'avec un contenu réellement utile —
 * jamais des dizaines de pages pauvres. Contenu 100 % fondé sur le cahier.
 */

import Link from "next/link"
import { ArrowRight, MapPin, Clock, Check } from "lucide-react"
import { CleanyzerShell } from "./site-shell"
import { PageHero, DirectAnswer } from "./page-primitives"
import { CleanyzerFaq, type FaqEntry } from "./faq"
import { CLZ_NAV_ITEMS } from "./nav"
import { CLZ_PREVIEW_BASE } from "./tokens"
import { TRAVEL, INTERIEUR_FORMULAS, EXTERIEUR_FORMULAS, TEXTILE_ITEMS } from "./content"

const LOCAL_FAQ: FaqEntry[] = [
  {
    q: "Intervenez-vous à Annecy ?",
    a: "Oui. Annecy est au cœur de la zone CLEANYZER : les 20 premiers kilomètres à l'aller sont inclus (40 km aller-retour), sans frais de déplacement supplémentaires.",
  },
  {
    q: "À quel prix pour un nettoyage à Annecy ?",
    a: "Le nettoyage intérieur démarre à 50 €, l'extérieur à 30 €, et le nettoyage de canapé à 80 €. Le total exact, options et déplacement compris, s'affiche dans le configurateur.",
  },
  {
    q: "Quels horaires à Annecy ?",
    a: "Du lundi au dimanche, de 7 h 30 à 20 h 30, directement à votre domicile.",
  },
]

export function LocalPageAnnecy() {
  const intMin = Math.min(...INTERIEUR_FORMULAS.flatMap((f) => Object.values(f.prices).filter((p): p is number => p != null)))
  const extMin = Math.min(...EXTERIEUR_FORMULAS.flatMap((f) => Object.values(f.prices).filter((p): p is number => p != null)))
  const txtMin = Math.min(...TEXTILE_ITEMS.map((t) => t.price).filter((p): p is number => p != null))

  const services = [
    { label: "Nettoyage intérieur voiture", from: intMin, href: `${CLZ_PREVIEW_BASE}/prestations/interieur` },
    { label: "Nettoyage extérieur voiture", from: extMin, href: `${CLZ_PREVIEW_BASE}/prestations/exterieur` },
    { label: "Nettoyage canapé & textile", from: txtMin, href: `${CLZ_PREVIEW_BASE}/prestations/textile` },
  ]

  return (
    <CleanyzerShell navItems={CLZ_NAV_ITEMS} active="Zone d'intervention">
      <PageHero
        eyebrow="Zone d'intervention"
        title="Nettoyage auto & textile à domicile à Annecy"
        intro="CLEANYZER intervient à Annecy et dans ses alentours, à votre domicile, 7 jours sur 7. Voici un exemple de page locale indexable."
        crumbs={[{ label: "Zones", href: `${CLZ_PREVIEW_BASE}#zone` }, { label: "Annecy" }]}
      />

      <section className="mx-auto max-w-3xl px-4 py-14 md:px-6 md:py-16">
        <DirectAnswer
          question="Proposez-vous le nettoyage de voiture à domicile à Annecy ?"
          answer="Oui. CLEANYZER se déplace à Annecy pour le nettoyage intérieur et extérieur de votre véhicule, ainsi que le nettoyage de canapé et textile. Les 20 premiers kilomètres à l'aller sont inclus."
        />

        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-2 rounded-full border border-[var(--clz-line)] px-4 py-2 text-[var(--clz-fg)]">
            <MapPin className="h-4 w-4 text-[var(--clz-blue)]" /> {TRAVEL.includedKmOneWay} km inclus autour d'Annecy
          </span>
          <span className="flex items-center gap-2 rounded-full border border-[var(--clz-line)] px-4 py-2 text-[var(--clz-fg)]">
            <Clock className="h-4 w-4 text-[var(--clz-blue)]" /> {TRAVEL.daysLabel}, {TRAVEL.hoursLabel}
          </span>
        </div>
      </section>

      <section className="bg-[var(--clz-surface-2)]">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-16">
          <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Nos prestations à Annecy</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {services.map((s) => (
              <Link key={s.label} href={s.href} className="clz-card group flex items-center justify-between p-5">
                <span>
                  <span className="block font-semibold text-[var(--clz-fg)]">{s.label}</span>
                  <span className="text-sm text-[var(--clz-muted)]">à partir de {s.from} €</span>
                </span>
                <ArrowRight className="h-5 w-5 text-[var(--clz-blue)] transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 md:px-6 md:py-16">
        <h2 className="clz-display clz-h2 text-[var(--clz-fg)]">Pourquoi choisir CLEANYZER à Annecy</h2>
        <ul className="mt-6 space-y-3">
          {[
            "Service à domicile : on vient à vous, dans Annecy et ses environs",
            "Prix transparents : total et déplacement affichés avant validation",
            "Réservation en ligne en quelques étapes pour l'automobile",
            "Demande personnalisée pour le canapé, le matelas et le tapis",
          ].map((v) => (
            <li key={v} className="flex items-start gap-3 text-[var(--clz-fg)]">
              <span className="clz-check mt-0.5 h-5 w-5"><Check className="h-3 w-3" /></span>
              {v}
            </li>
          ))}
        </ul>

        <h2 className="clz-display clz-h2 mt-14 text-[var(--clz-fg)]">Questions fréquentes — Annecy</h2>
        <div className="mt-6">
          <CleanyzerFaq entries={LOCAL_FAQ} />
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href={`${CLZ_PREVIEW_BASE}/reservation`} className="clz-btn clz-btn-primary">Réserver à Annecy <ArrowRight className="h-4 w-4" /></Link>
          <Link href={`${CLZ_PREVIEW_BASE}/demande`} className="clz-btn clz-btn-ghost">Devis textile</Link>
        </div>

        <p className="mt-8 rounded-lg bg-[var(--clz-surface-2)] p-4 text-xs text-[var(--clz-muted)]">
          Note technique (maquette) : cette page illustre le gabarit local (LocalBusiness / Service +
          BreadcrumbList en JSON-LD, metadata et canonical par ville). Les communes réellement
          couvertes et les données GMB seront confirmées avant indexation — aucune donnée inventée.
        </p>
      </section>
    </CleanyzerShell>
  )
}
