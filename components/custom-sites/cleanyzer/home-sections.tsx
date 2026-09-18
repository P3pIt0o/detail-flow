/**
 * Sections de la page d'accueil CLEANYZER (maquette Phase 1).
 * Contenu fondé sur le cahier. Aucun autre tenant impacté (tout est sous `.cleanyzer`).
 */

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Car, Sofa, MapPin, Clock, Home, Sparkles, ShieldCheck } from "lucide-react"
import { BeforeAfterSlider } from "@/components/before-after-slider"
import { CleanyzerFaq } from "./faq"
import { BRAND, TRAVEL, INTERIEUR_FORMULAS, EXTERIEUR_FORMULAS, TEXTILE_ITEMS } from "./content"
import { CLZ_PREVIEW_BASE } from "./tokens"

function SectionHead({
  eyebrow,
  title,
  intro,
  dark,
  center,
}: {
  eyebrow: string
  title: React.ReactNode
  intro?: string
  dark?: boolean
  center?: boolean
}) {
  return (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      <span className="clz-rule mb-5 data-[center=true]:mx-auto" data-center={center} />
      <span className="clz-eyebrow">{eyebrow}</span>
      <h2 className={`clz-display clz-h2 mt-3 text-balance ${dark ? "text-white" : "text-[var(--clz-fg)]"}`}>
        {title}
      </h2>
      {intro && (
        <p className={`mt-4 text-pretty leading-relaxed ${dark ? "text-[var(--clz-on-dark-muted)]" : "text-[var(--clz-muted)]"}`}>
          {intro}
        </p>
      )}
    </div>
  )
}

/* Deux univers clairement séparés (cahier §3). */
export function UniversSection() {
  const cards = [
    {
      icon: Car,
      tag: "Automobile",
      title: "Réservez votre nettoyage auto",
      text: "Intérieur ou extérieur, du lavage Éco au détail Excellence. Parcours guidé, prix en direct.",
      img: "/custom-sites/cleanyzer/service-interieur.png",
      href: `${CLZ_PREVIEW_BASE}/reservation`,
      cta: "Réserver un nettoyage",
    },
    {
      icon: Sofa,
      tag: "Textile & mobilier",
      title: "Demandez un devis textile",
      text: "Canapé, matelas, tapis, moquette. Aspiration, shampoing, désinfection et traitement des odeurs.",
      img: "/custom-sites/cleanyzer/service-textile.png",
      href: `${CLZ_PREVIEW_BASE}/demande`,
      cta: "Faire une demande",
    },
  ]
  return (
    <section id="prestations" className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
      <SectionHead
        eyebrow="Deux expertises, une exigence"
        title="Pour votre véhicule ou votre mobilier"
        intro="CLEANYZER sépare clairement deux univers. L'automobile se réserve en ligne ; le textile fait l'objet d'une demande personnalisée."
      />
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {cards.map((c) => (
          <article key={c.tag} className="clz-card group relative overflow-hidden">
            <div className="relative aspect-[16/10] overflow-hidden">
              <Image
                src={c.img || "/placeholder.svg"}
                alt={c.title}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                <c.icon className="h-3.5 w-3.5" />
                {c.tag}
              </span>
            </div>
            <div className="p-6 md:p-7">
              <h3 className="clz-display clz-h3 text-[var(--clz-fg)]">{c.title}</h3>
              <p className="mt-3 leading-relaxed text-[var(--clz-muted)]">{c.text}</p>
              <Link href={c.href} className="clz-btn clz-btn-primary mt-6 w-full sm:w-auto">
                {c.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

/* Aperçu tarifs / prestations (chiffres exacts du cahier). */
export function PrestationsPreview() {
  const intMin = Math.min(...INTERIEUR_FORMULAS.flatMap((f) => Object.values(f.prices).filter((p): p is number => p != null)))
  const extMin = Math.min(...EXTERIEUR_FORMULAS.flatMap((f) => Object.values(f.prices).filter((p): p is number => p != null)))
  const txtMin = Math.min(...TEXTILE_ITEMS.map((t) => t.price).filter((p): p is number => p != null))
  const items = [
    { label: "Nettoyage intérieur", from: intMin, href: `${CLZ_PREVIEW_BASE}/prestations/interieur`, img: "/custom-sites/cleanyzer/service-interieur.png" },
    { label: "Nettoyage extérieur", from: extMin, href: `${CLZ_PREVIEW_BASE}/prestations/exterieur`, img: "/custom-sites/cleanyzer/service-exterieur.png" },
    { label: "Canapé & textile", from: txtMin, href: `${CLZ_PREVIEW_BASE}/prestations/textile`, img: "/custom-sites/cleanyzer/service-textile.png" },
  ]
  return (
    <section className="bg-[var(--clz-surface-2)]">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHead eyebrow="Prestations & tarifs" title="Des formules claires, dès le premier euro" />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map((it) => (
            <Link key={it.label} href={it.href} className="clz-card group overflow-hidden">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image src={it.img || "/placeholder.svg"} alt={it.label} fill sizes="(max-width:768px) 100vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
              </div>
              <div className="flex items-center justify-between p-5">
                <div>
                  <h3 className="font-semibold text-[var(--clz-fg)]">{it.label}</h3>
                  <p className="text-sm text-[var(--clz-muted)]">à partir de {it.from} €</p>
                </div>
                <ArrowRight className="h-5 w-5 text-[var(--clz-blue)] transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href={`${CLZ_PREVIEW_BASE}/tarifs`} className="clz-btn clz-btn-ghost">
            Voir tous les tarifs
          </Link>
        </div>
      </div>
    </section>
  )
}

/* Avant / après — dégradé renforcé (cahier : renforcer progressivement le dégradé). */
export function RealisationsPreview() {
  return (
    <section id="realisations" className="clz-dark-strong relative overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHead
          dark
          eyebrow="Réalisations"
          title="Les résultats parlent d'eux-mêmes"
          intro="Glissez le curseur pour comparer l'avant et l'après d'une intervention CLEANYZER."
        />
        <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
          <div className="clz-compare">
            <BeforeAfterSlider
              before="/custom-sites/cleanyzer/avant.png"
              after="/custom-sites/cleanyzer/apres.png"
              alt="Nettoyage intérieur véhicule"
            />
          </div>
          <div>
            <h3 className="clz-display clz-h3 text-white">Un intérieur comme neuf</h3>
            <p className="mt-4 leading-relaxed text-[var(--clz-on-dark-muted)]">
              Sièges, tapis, plastiques et recoins : chaque détail est traité. Les futures
              réalisations deviendront des pages dédiées, indexables et localisées.
            </p>
            <Link href={`${CLZ_PREVIEW_BASE}/realisations`} className="clz-btn clz-btn-ghost mt-7">
              Voir les réalisations
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/* Service à domicile (bleu #0A84FF — cahier). */
export function ServiceADomicile() {
  const points = [
    { icon: Home, title: "Chez vous", text: "On vient à votre domicile, vous ne déplacez pas votre véhicule." },
    { icon: Clock, title: "7j/7, 7 h 30 – 20 h 30", text: "Des créneaux souples, du lundi au dimanche." },
    { icon: Sparkles, title: "Matériel professionnel", text: "Produits et équipements pensés pour un rendu premium." },
    { icon: ShieldCheck, title: "Prix transparents", text: "Total et déplacement affichés clairement avant de valider." },
  ]
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
      <SectionHead eyebrow="Service à domicile" title="Le premium vient à vous" center />
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {points.map((p) => (
          <div key={p.title} className="clz-card p-6">
            <span className="clz-check h-11 w-11">
              <p.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-semibold text-[var(--clz-fg)]">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--clz-muted)]">{p.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* Zone d'intervention (règles exactes cahier §9). */
export function ZoneSection() {
  return (
    <section id="zone" className="bg-[var(--clz-surface-2)]">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:grid-cols-2 md:px-6 md:py-28">
        <div>
          <SectionHead
            eyebrow="Zone d'intervention"
            title="Annecy et alentours"
            intro="CLEANYZER intervient autour d'Annecy. Les frais de déplacement sont calculés simplement et affichés avant validation."
          />
          <ul className="mt-8 space-y-4">
            <li className="flex gap-3">
              <span className="clz-check mt-0.5"><MapPin className="h-3.5 w-3.5" /></span>
              <span className="text-[var(--clz-fg)]">
                <strong>{TRAVEL.includedKmOneWay} km à l'aller inclus</strong> autour d'Annecy
                (soit {TRAVEL.includedKmRoundTrip} km aller-retour).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="clz-check mt-0.5"><ArrowRight className="h-3.5 w-3.5" /></span>
              <span className="text-[var(--clz-fg)]">
                Au-delà : <strong>{TRAVEL.pricePerExtraKm} € / km supplémentaire</strong> parcouru
                (ex. +5 km à l'aller = +10 € A/R).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="clz-check mt-0.5"><Clock className="h-3.5 w-3.5" /></span>
              <span className="text-[var(--clz-fg)]">{TRAVEL.daysLabel}, {TRAVEL.hoursLabel}.</span>
            </li>
          </ul>
          <p className="mt-6 text-sm text-[var(--clz-muted)]">
            Communes précises couvertes : à confirmer avec Tom (aucune commune inventée).
          </p>
        </div>
        <div className="clz-card relative overflow-hidden">
          <Image
            src="/custom-sites/cleanyzer/service-exterieur.png"
            alt="Intervention CLEANYZER à domicile"
            width={800}
            height={800}
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </section>
  )
}

export function AvisSection() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-20 text-center md:px-6 md:py-28">
      <SectionHead eyebrow="Avis clients" title="Ils ont adoré le résultat" center />
      <p className="mx-auto mt-6 max-w-xl text-pretty leading-relaxed text-[var(--clz-muted)]">
        Les avis Google réels de CLEANYZER (note et nombre) seront affichés ici une fois
        confirmés. Conformément à la règle du cahier, aucune note ni aucun avis n'est inventé.
      </p>
      <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-[var(--clz-line)] px-4 py-2 text-sm text-[var(--clz-muted)]">
        Preuve sociale à connecter — source de vérité DetailFlow / Google
      </div>
    </section>
  )
}

export function FaqSection() {
  return (
    <section id="faq" className="bg-[var(--clz-surface-2)]">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHead eyebrow="Questions fréquentes" title="Tout savoir avant de réserver" center />
        <div className="mt-12">
          <CleanyzerFaq />
        </div>
      </div>
    </section>
  )
}

export function FinalCta() {
  return (
    <section className="clz-dark relative overflow-hidden">
      <Image src="/custom-sites/cleanyzer/logo.png" alt="" aria-hidden width={800} height={190} className="clz-watermark -left-16 -bottom-10 w-[min(70%,560px)]" />
      <div className="relative mx-auto max-w-4xl px-4 py-24 text-center md:px-6">
        <h2 className="clz-display clz-h2 text-balance text-white">
          Réservez votre nettoyage pro en 2 minutes
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-[var(--clz-on-dark-muted)]">
          {BRAND.subtitle} {BRAND.area}. {BRAND.tagline}
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={`${CLZ_PREVIEW_BASE}/reservation`} className="clz-btn clz-btn-primary !px-7 !py-4 !text-base">
            Réserver un nettoyage auto
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href={`${CLZ_PREVIEW_BASE}/demande`} className="clz-btn clz-btn-ghost !px-7 !py-4 !text-base">
            Faire une demande personnalisée
          </Link>
        </div>
      </div>
    </section>
  )
}
