/**
 * Template de PAGE PRESTATION (ex. « Nettoyage de canapé à domicile »).
 *
 * Orientée conversion ET SEO : hero dédié → preuve sociale → problèmes traités
 * → avant/après → méthode Rozan → bénéfices → devis → réalisations → zones →
 * avis → FAQ → CTA final. Sémantique <h1>/<h2> propre, un seul H1.
 *
 * PHASE 2 : contenu de démonstration par prestation. En Phase 4, les textes
 * seront administrables par tenant et le formulaire branché au back-office.
 */

import Link from "next/link"
import { ChevronRight, Check, Droplets, Home, Sparkles } from "lucide-react"
import { RozanSiteShell } from "./site-shell"
import { RozanTrustBar } from "./rozan-trust-bar"
import { RozanAvantApres } from "./rozan-avant-apres"
import { RozanAvis } from "./rozan-avis"
import { RozanZones } from "./rozan-zones"
import { RozanDevis } from "./rozan-devis"
import { RozanFaq } from "./rozan-faq"
import { RozanFinalCta } from "./rozan-final-cta"
import { RozanShot } from "./rozan-shot"
import { RozanGoogleProof } from "./rozan-google-proof"
import { ROZAN_SECTIONS, type RozanNavItem } from "./tokens"
import { ROZAN_BRAND, ROZAN_GOOGLE, ROZAN_SERVICES, type RozanServiceSlug } from "./content"

const SUBPAGE_NAV: RozanNavItem[] = [
  { id: "p", label: "Prestations", route: `/#${ROZAN_SECTIONS.prestations}` },
  { id: "a", label: "Avant / Après", route: `/#${ROZAN_SECTIONS.avantApres}` },
  { id: "z", label: "Zones d'intervention", route: `/#${ROZAN_SECTIONS.zones}` },
  { id: "v", label: "Avis", route: `/#${ROZAN_SECTIONS.avis}` },
  { id: "f", label: "FAQ", route: `/#${ROZAN_SECTIONS.faq}` },
]

// Contenu éditorial par prestation (démonstration Phase 2).
const SERVICE_COPY: Record<
  string,
  { subtitle: string; problems: string[]; method: { title: string; text: string }[]; benefits: string[] }
> = {
  "nettoyage-canape": {
    subtitle:
      "Injection-extraction en profondeur, traitement des taches et des odeurs, séchage maîtrisé. Nous redonnons vie à votre canapé directement chez vous.",
    problems: ["Taches incrustées", "Odeurs persistantes", "Auréoles et salissures", "Tissu terni", "Acariens et poussières"],
    method: [
      { title: "Diagnostic de la matière", text: "Nous identifions le textile pour choisir la méthode et les produits adaptés." },
      { title: "Détachage ciblé", text: "Prétraitement des taches et zones sensibles avant le nettoyage complet." },
      { title: "Injection-extraction", text: "Nettoyage en profondeur qui décolle et aspire la saleté au cœur des fibres." },
      { title: "Séchage maîtrisé", text: "Nous limitons l'humidité résiduelle pour un canapé rapidement réutilisable." },
    ],
    benefits: ["Résultat visible dès la première intervention", "Sans déplacer votre canapé", "Autonomes en eau et électricité", "Produits adaptés aux matières délicates"],
  },
  "nettoyage-voiture": {
    subtitle:
      "Intérieur, extérieur ou complet : vapeur, sièges, textiles et plastiques. Votre véhicule retrouve son éclat sans quitter votre domicile.",
    problems: ["Habitacle encrassé", "Taches sur les sièges", "Odeurs dans l'habitacle", "Plastiques ternis", "Poussière et sable"],
    method: [
      { title: "Préparation", text: "Aspiration complète et dépoussiérage de l'habitacle." },
      { title: "Vapeur & détachage", text: "Traitement vapeur des sièges, textiles et zones de contact." },
      { title: "Finitions intérieures", text: "Nettoyage des plastiques, vitres et détails." },
      { title: "Extérieur (si complet)", text: "Lavage soigné de la carrosserie et des jantes." },
    ],
    benefits: ["Sans laverie ni déplacement", "Intérieur assaini et désodorisé", "Autonomes en eau et électricité", "Adapté à tous types de véhicules"],
  },
}

function copyFor(slug: RozanServiceSlug) {
  return (
    SERVICE_COPY[slug] ?? {
      subtitle: "Un nettoyage professionnel en profondeur, réalisé directement chez vous.",
      problems: ["Salissures incrustées", "Taches", "Odeurs", "Aspect terni"],
      method: [
        { title: "Diagnostic", text: "Nous évaluons la surface et adaptons notre méthode." },
        { title: "Traitement ciblé", text: "Prétraitement des zones sensibles." },
        { title: "Nettoyage en profondeur", text: "Équipement professionnel pour un résultat durable." },
        { title: "Finitions", text: "Contrôle et séchage maîtrisé." },
      ],
      benefits: ["Résultat professionnel", "À domicile", "Autonomes en eau et électricité", "Équipement adapté"],
    }
  )
}

const BENEFIT_ICONS = [Sparkles, Home, Droplets, Check] as const

export function RozanServicePage({ slug }: { slug: RozanServiceSlug }) {
  const service = ROZAN_SERVICES.find((s) => s.slug === slug) ?? ROZAN_SERVICES[1]
  const copy = copyFor(service.slug)

  return (
    <RozanSiteShell
      brandName={ROZAN_BRAND.name}
      navItems={SUBPAGE_NAV}
      ctaHref={`#${ROZAN_SECTIONS.devis}`}
      ctaLabel="Obtenir mon devis"
      phoneRaw={ROZAN_BRAND.phoneRaw}
      phoneLabel={ROZAN_BRAND.phone}
      stickyCtaHref={`#${ROZAN_SECTIONS.devis}`}
      stickyCtaLabel="Obtenir mon devis"
    >
      {/* Fil d'Ariane */}
      <div className="bg-[var(--rozan-bg)]">
        <nav aria-label="Fil d'Ariane" className="mx-auto flex w-full max-w-7xl items-center gap-1.5 px-4 pt-6 text-sm text-[var(--rozan-muted)] sm:px-6 lg:px-8">
          <Link href="/" className="transition-colors hover:text-[var(--rozan-accent)]">Accueil</Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <Link href={`/#${ROZAN_SECTIONS.prestations}`} className="transition-colors hover:text-[var(--rozan-accent)]">Prestations</Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span className="text-[var(--rozan-fg)]">{service.label}</span>
        </nav>
      </div>

      {/* Hero prestation */}
      <section className="bg-[var(--rozan-bg)]">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:px-8 lg:py-16">
          <div>
            <p className="rozan-eyebrow">Pays de Gex · Genève</p>
            <h1 className="rozan-title rozan-h1 mt-4 text-balance text-[var(--rozan-fg)]">
              {service.title}
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-[var(--rozan-muted)] sm:text-lg">
              {copy.subtitle}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={`#${ROZAN_SECTIONS.devis}`}
                className="inline-flex h-13 items-center justify-center rounded-full bg-[var(--rozan-accent)] px-8 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)]"
              >
                Obtenir mon devis
              </a>
              <RozanGoogleProof rating={ROZAN_GOOGLE.rating} count={ROZAN_GOOGLE.count} href={ROZAN_GOOGLE.url} />
            </div>
          </div>
          <RozanShot label={service.shot} ratio="aspect-[4/3]" rounded="rounded-3xl" />
        </div>
      </section>

      <RozanTrustBar />

      {/* Problèmes traités */}
      <section className="bg-[var(--rozan-surface)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <span className="rozan-rule" />
            <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">Ce que nous traitons</h2>
          </div>
          <ul className="mt-8 flex flex-wrap gap-3">
            {copy.problems.map((p) => (
              <li key={p} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--rozan-line)] bg-[var(--rozan-bg)] px-4 py-2 text-sm text-[var(--rozan-fg)]">
                <span className="rozan-check"><Check className="size-3.5" aria-hidden="true" /></span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <RozanAvantApres />

      {/* Méthode Rozan */}
      <section className="bg-[var(--rozan-surface)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <span className="rozan-rule" />
            <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">La méthode Rozan</h2>
          </div>
          <ol className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {copy.method.map((m, i) => (
              <li key={m.title} className="rounded-2xl border border-[color:var(--rozan-line)] bg-[var(--rozan-bg)] p-6">
                <span className="rozan-title text-sm text-[var(--rozan-accent)]">0{i + 1}</span>
                <h3 className="rozan-title mt-3 text-lg text-[var(--rozan-fg)]">{m.title}</h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--rozan-muted)]">{m.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Bénéfices */}
      <section className="bg-[var(--rozan-bg)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {copy.benefits.map((b, i) => {
              const Icon = BENEFIT_ICONS[i % BENEFIT_ICONS.length]
              return (
                <div key={b} className="flex items-start gap-3 rounded-2xl border border-[color:var(--rozan-line)] bg-[var(--rozan-surface)] p-5">
                  <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-[var(--rozan-accent-soft)] text-[var(--rozan-accent)]">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium text-[var(--rozan-fg)]">{b}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <RozanDevis />

      {/* Réalisations (emplacements photos) */}
      <section id={ROZAN_SECTIONS.realisations} className="bg-[var(--rozan-surface)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <span className="rozan-rule" />
            <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">Nos réalisations</h2>
            <p className="mt-3 text-pretty text-[var(--rozan-muted)]">Quelques interventions récentes. Vos vraies photos remplaceront ces emplacements.</p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <RozanShot key={i} label={`${service.shot} — réalisation ${i + 1}`} ratio="aspect-square" />
            ))}
          </div>
        </div>
      </section>

      <RozanZones />
      <RozanAvis />
      <RozanFaq />
      <RozanFinalCta />
    </RozanSiteShell>
  )
}
