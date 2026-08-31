import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

/**
 * Ajustements Spirit ACS (branche fix/spirit-acs-hero-google-services) —
 * invariants STRUCTURELS vérifiables sans rendu DOM ni base de données :
 *  1. Présentation Google compacte DANS le hero, sous les boutons : note RÉELLE
 *     et dynamique (jamais en dur), masquée si indisponible, cliquable vers la
 *     fiche Google (attribution).
 *  2. Section « familles de prestations » : 4 cartes dans l'ordre imposé,
 *     images réelles existantes, lien vers le formulaire de devis existant,
 *     ancre + lien de navigation, sans catalogue/tarif en base.
 *
 * Ces tests préservent aussi les correctifs précédents (nav, CTA final retiré,
 * avis par source) en vérifiant qu'ils ne sont pas régressés.
 */

const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")
const SPIRIT = "components/custom-sites/spirit-acs"

describe("Spirit — présentation Google compacte dans le hero (#1)", () => {
  const hero = () => read(`${SPIRIT}/spirit-hero.tsx`)
  const home = () => read(`${SPIRIT}/home-page.tsx`)

  it("le hero reçoit une note Google en props (dynamique, non codée en dur)", () => {
    const src = hero()
    expect(src).toMatch(/googleRating\??:/)
    expect(src).toMatch(/googleUrl\??:/)
    // Aucune note « 5,0 » / « 5.0 » codée en dur dans le hero.
    expect(src).not.toMatch(/["']5[.,]0["']/)
    // Formatage à la française de la vraie note.
    expect(src).toMatch(/toLocaleString\(\s*["']fr-FR["']/)
  })

  it("affiche la note seulement si disponible, avec étoile rose et mention Google", () => {
    const src = hero()
    // Rendu conditionnel : pas de note => pas d'affichage (rien inventé).
    expect(src).toMatch(/ratingLabel\s*&&/)
    expect(src).toMatch(/sur Google/)
    // Étoile colorée avec le rose de marque.
    expect(src).toMatch(/Star/)
    expect(src).toMatch(/var\(--spirit-pink\)/)
  })

  it("la note renvoie vers la fiche Google (lien d'attribution)", () => {
    const src = hero()
    expect(src).toMatch(/href=\{googleUrl\}/)
    expect(src).toMatch(/rel="noopener noreferrer"/)
  })

  it("la note Google réelle est résolue côté serveur, indépendamment de la source d'avis", () => {
    const src = home()
    expect(src).toMatch(/getTenantGoogleRating/)
    expect(src).toMatch(/googleRating=\{/)
    // Réutilise la fiche déjà chargée quand les avis viennent de Google.
    expect(src).toMatch(/reviewsResolved\.data\.rating/)
  })

  it("le helper de note globale réutilise l'API Google existante (aucune moyenne recalculée)", () => {
    const src = read("lib/reviews/public.ts")
    expect(src).toMatch(/export async function getTenantGoogleRating/)
    expect(src).toMatch(/getReviewsSourceConfig/)
    expect(src).toMatch(/getGooglePlaceDetails/)
    // Renvoie null si aucun établissement / note indisponible (rien inventé).
    expect(src).toMatch(/return null/)
  })
})

describe("Spirit — section familles de prestations (#2)", () => {
  const prest = () => read(`${SPIRIT}/spirit-prestations.tsx`)
  const home = () => read(`${SPIRIT}/home-page.tsx`)

  it("le composant de section existe", () => {
    expect(existsSync(path.join(root, SPIRIT, "spirit-prestations.tsx"))).toBe(true)
  })

  it("titre exact et 4 cartes dans l'ordre imposé", () => {
    const src = prest()
    expect(src.toLowerCase()).toMatch(/un soin adapté à chaque véhicule/)
    const order = [
      "Nettoyage intérieur & extérieur",
      "Polissage & céramique",
      "Protection PPF",
      "Moto & personnalisation",
    ]
    let last = -1
    for (const label of order) {
      const idx = src.indexOf(label)
      expect(idx, `carte manquante: ${label}`).toBeGreaterThan(-1)
      expect(idx, `ordre incorrect: ${label}`).toBeGreaterThan(last)
      last = idx
    }
  })

  it("utilise des images réelles existantes (aucune génération, aucune capture de maquette)", () => {
    const src = prest()
    const images = [
      "public/services/interieur-complet.png",
      "public/services/protection-ceramique.png",
      "public/services/renovation-carrosserie.png",
      "public/custom-sites/spirit-acs/service-moto.png",
    ]
    for (const img of images) {
      expect(existsSync(path.join(root, img)), `image absente: ${img}`).toBe(true)
    }
  })

  it("grille responsive 1 → 2 → 4 colonnes, sans carrousel", () => {
    const src = prest()
    expect(src).toMatch(/grid-cols-1/)
    expect(src).toMatch(/min-\[420px\]:grid-cols-2/)
    expect(src).toMatch(/lg:grid-cols-4/)
    expect(src).not.toMatch(/carousel|Carousel|embla|swiper/)
  })

  it("chaque carte mène au devis via une ancre (pas de prestation/tarif en base)", () => {
    const src = prest()
    expect(src).toMatch(/href=\{ctaHref\}/)
    // Vitrine éditoriale : aucun accès base, aucun prix.
    expect(src).not.toMatch(/\bdb\b|drizzle|basePriceCents|prix|€/)
  })

  it("ancre + lien de navigation « Prestations », rendu avant les réalisations", () => {
    const src = home()
    expect(src).toMatch(/SpiritPrestations/)
    expect(src).toMatch(/label: "Prestations"/)
    // La section prestations est rendue avant la section réalisations.
    expect(src.indexOf("SpiritPrestations")).toBeLessThan(src.indexOf("SpiritRealisations title="))
  })
})

describe("Spirit — correctifs précédents préservés", () => {
  it("nav in-page, CTA final retiré, avis par source restent en place", () => {
    const nav = read(`${SPIRIT}/spirit-navigation.tsx`)
    const home = read(`${SPIRIT}/home-page.tsx`)
    expect(nav).toMatch(/handleAnchorClick/)
    expect(home).not.toMatch(/SpiritFinalCta/)
    expect(home).toMatch(/resolveTenantReviews/)
  })
})
