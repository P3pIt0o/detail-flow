/**
 * Sections de la page d'accueil CLEANYZER (maquette Phase 1).
 * Contenu fondé sur le cahier. Aucun autre tenant impacté (tout est sous `.cleanyzer`).
 */

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, ArrowUpRight, Car, Sofa, MapPin, Clock, Home, Sparkles, ShieldCheck, Star, UserRound, BadgeCheck } from "lucide-react"
import { BeforeAfterSlider } from "@/components/before-after-slider"
import { CleanyzerFaq } from "./faq"
import { BRAND, INTERIEUR_FORMULAS, EXTERIEUR_FORMULAS, TEXTILE_ITEMS } from "./content"
import { CLZ_BOOKING_HREF, CLZ_DEMANDE_HREF } from "./tokens"

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
      href: CLZ_BOOKING_HREF,
      cta: "Réserver un nettoyage",
    },
    {
      icon: Sofa,
      tag: "Textile & mobilier",
      title: "Demandez un devis textile",
      text: "Canapé, matelas, tapis, moquette. Aspiration, shampoing, désinfection et traitement des odeurs.",
      img: "/custom-sites/cleanyzer/service-textile.png",
      href: CLZ_DEMANDE_HREF,
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
    { label: "Nettoyage intérieur", from: intMin, href: CLZ_BOOKING_HREF, img: "/custom-sites/cleanyzer/service-interieur.png" },
    { label: "Nettoyage extérieur", from: extMin, href: CLZ_BOOKING_HREF, img: "/custom-sites/cleanyzer/service-exterieur.png" },
    { label: "Canapé & textile", from: txtMin, href: CLZ_DEMANDE_HREF, img: "/custom-sites/cleanyzer/service-textile.png" },
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
          <Link href={CLZ_BOOKING_HREF} className="clz-btn clz-btn-ghost">
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
          eyebrow="Le soin en images"
          title={<>Une différence <span className="clz-accent">qui se voit.</span></>}
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
            <Link href={CLZ_BOOKING_HREF} className="clz-btn clz-btn-ghost mt-7">
              Réserver un nettoyage
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
      <SectionHead
        eyebrow="Le service à domicile"
        title={<>Votre nettoyage à domicile, <span className="clz-accent">à Annecy.</span></>}
        center
      />
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

/* Zone d'intervention : module dédié (zone-section.tsx), réexporté ici. */
export { ZoneSection } from "./zone-section"

/* Section « Derrière CLEANYZER » (brief §9). Portrait réel de Tom à venir :
   emplacement propre aux bonnes dimensions, aucun portrait IA. */
export function AProposSection() {
  return (
    <section id="apropos" className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
      <div className="grid items-center gap-12 md:grid-cols-[minmax(0,340px)_1fr] md:gap-16">
        <div className="mx-auto w-full max-w-[340px]">
          {/* Emplacement portrait — ratio 4/5. Remplacer par la vraie photo de
              Tom sans toucher à la mise en page (mêmes dimensions). */}
          <div className="clz-portrait relative aspect-[4/5] w-full overflow-hidden">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <span className="clz-check h-14 w-14">
                <UserRound className="h-6 w-6" />
              </span>
              <span className="px-6 text-sm text-[var(--clz-muted)]">
                Portrait de {BRAND.ownerFullName} à venir
              </span>
            </div>
          </div>
        </div>
        <div>
          <SectionHead
            eyebrow="Derrière CLEANYZER"
            title={
              <>
                {BRAND.ownerFullName}, detailer professionnel{" "}
                <span className="clz-accent">à Annecy.</span>
              </>
            }
            intro="Un professionnel à votre écoute, pour votre véhicule comme pour vos textiles."
          />

          <p className="clz-eyebrow mt-10">{BRAND.ownerFullName} — {BRAND.name}</p>
          <p className="clz-display clz-h3 mt-2 text-[var(--clz-fg)]">
            Le souci <span className="clz-accent">du détail.</span>
          </p>
          <div className="mt-5 space-y-4 text-pretty leading-relaxed text-[var(--clz-muted)]">
            <p>
              À Annecy et aux alentours, {BRAND.ownerFullName} vous accompagne dans
              votre projet de nettoyage automobile ou textile à domicile.
            </p>
            <p>
              Votre véhicule, votre canapé, vos tapis ou vos moquettes : échangez
              avec {BRAND.ownerFirstName} pour définir la prestation adaptée à
              votre besoin.
            </p>
          </div>

          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { icon: BadgeCheck, text: "Un échange direct" },
              { icon: Sparkles, text: "Une prestation adaptée" },
              { icon: ShieldCheck, text: "Le soin des finitions" },
            ].map((p, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="clz-check"><p.icon className="h-3.5 w-3.5" /></span>
                <span className="text-sm font-medium leading-snug text-[var(--clz-fg)]">{p.text}</span>
              </li>
            ))}
          </ul>

          <Link
            href={CLZ_BOOKING_HREF}
            className="mt-9 inline-flex items-center gap-1.5 text-base font-medium text-[var(--clz-blue)] transition hover:opacity-80"
          >
            Parler de mon projet
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

export function AvisSection() {
  const rating = BRAND.googleRating
  const count = BRAND.googleReviewCount
  return (
    <section className="bg-[var(--clz-surface-2)]">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center md:px-6 md:py-28">
        <SectionHead eyebrow="Avis clients" title="Ils ont adoré le résultat" center />
        {/* Preuve sociale Google : 5,0/5 — 86 avis (fiche Google Maps officielle). */}
        <div className="mx-auto mt-10 inline-flex flex-col items-center gap-4 rounded-2xl border border-[var(--clz-line)] bg-[var(--clz-surface)] px-8 py-7 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--clz-muted)]">
            <GoogleGlyph className="h-5 w-5" />
            Avis Google
          </div>
          <div className="flex items-baseline gap-2">
            <span className="clz-display text-4xl font-semibold text-[var(--clz-fg)]">
              {rating?.toLocaleString("fr-FR", { minimumFractionDigits: 1 })}
            </span>
            <span className="text-lg text-[var(--clz-muted)]">/ 5</span>
          </div>
          <div className="flex" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-[var(--clz-gold)] text-[var(--clz-gold)]" />
            ))}
          </div>
          <p className="text-sm text-[var(--clz-muted)]">
            Basé sur <strong className="text-[var(--clz-fg)]">{count} avis</strong> Google
          </p>
          {BRAND.googleReviewsUrl && (
            <a
              href={BRAND.googleReviewsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="clz-btn clz-btn-primary !px-5 !py-2.5 !text-sm"
            >
              Voir les avis Google
              <span className="sr-only">(nouvel onglet)</span>
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

/* Logo Google multicolore — SVG officiel simple (marque, non décoratif). */
function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
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
      <div className="relative mx-auto max-w-4xl px-4 py-24 text-center md:px-6">
        <h2 className="clz-display clz-h2 text-balance text-white">
          Réservez votre nettoyage pro en 2 minutes
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-[var(--clz-on-dark-muted)]">
          {BRAND.subtitle} {BRAND.area}. {BRAND.tagline}
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={CLZ_BOOKING_HREF} className="clz-btn clz-btn-primary !px-7 !py-4 !text-base">
            Réserver un nettoyage auto
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href={CLZ_DEMANDE_HREF} className="clz-btn clz-btn-ghost !px-7 !py-4 !text-base">
            Faire une demande personnalisée
          </Link>
        </div>
      </div>
    </section>
  )
}
