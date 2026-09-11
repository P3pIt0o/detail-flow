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
// Retire les commentaires (/* */ et //) pour que les invariants structurels
// (compte de balises, mots interdits) portent sur le CODE, pas la documentation.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const SPIRIT = "components/custom-sites/spirit-acs"

describe("Spirit — hero fidèle à la maquette + note Google résolue côté serveur (#1)", () => {
  const hero = () => read(`${SPIRIT}/spirit-hero.tsx`)
  const home = () => read(`${SPIRIT}/home-page.tsx`)

  it("le hero accepte toujours la note Google en props (compat), sans la coder en dur", () => {
    const src = hero()
    expect(src).toMatch(/googleRating\??:/)
    expect(src).toMatch(/googleUrl\??:/)
    // Aucune note « 5,0 » / « 5.0 » codée en dur dans le hero.
    expect(src).not.toMatch(/["']5[.,]0["']/)
  })

  it("la maquette validée place les 4 repères de réassurance dans le hero (plus la ligne Google)", () => {
    const src = hero()
    // La ligne « note · sur Google » a été retirée du hero au profit de la
    // rangée de repères de la maquette (la note reste visible dans la section
    // Avis). Le hero n'affiche donc plus la mention Google ni l'étoile.
    expect(src).not.toMatch(/sur Google/)
    expect(src).toMatch(/Résultat professionnel/)
    expect(src).toMatch(/Pour tous types de véhicules/)
  })

  it("le hero utilise la vraie photo Porsche de l'atelier (aucune image IA)", () => {
    const src = hero()
    expect(src).toMatch(/polissage-porsche-911\.jpg/)
    expect(src).not.toMatch(/spirit-hero-v2\.webp/)
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

  it("titre de la maquette, paragraphe SEO visible et grille pilotée par le catalogue", () => {
    const src = prest()
    // Titre de section repris de la maquette validée.
    expect(src.toLowerCase()).toMatch(/choisissez, puis demandez votre devis/)
    // Paragraphe SEO visible présent dans le HTML initial (non masqué).
    expect(src).toMatch(/Spirit ACS propose à Lagny-sur-Marne et aux alentours des prestations/)
    // Section SOMBRE (fond navy) — conformité maquette (plus de grande surface blanche).
    expect(src).toMatch(/bg-\[var\(--spirit-navy\)\]/)
    // Grille pilotée par le catalogue public : aucune liste de slugs en dur, on
    // itère sur les `services` reçus et on rend chaque `page`.
    expect(src).toMatch(/services\.map/)
    expect(src).toMatch(/page\.slug/)
    expect(src).toMatch(/page\.image/)
    // Titres de cartes en <h3> ; un seul <h2> pour la section.
    expect(stripComments(src)).toMatch(/<h3/)
    expect((stripComments(src).match(/<h2/g) ?? []).length).toBe(1)
  })

  it("utilise des images réelles existantes (aucune génération, aucune capture de maquette)", () => {
    const src = prest()
    const images = [
      "public/services/lavage-premium.png",
      "public/services/protection-ceramique.png",
      "public/services/renovation-carrosserie.png",
      "public/custom-sites/spirit-acs/service-moto.png",
    ]
    for (const img of images) {
      expect(existsSync(path.join(root, img)), `image absente: ${img}`).toBe(true)
    }
  })

  it("grille responsive panoramique 1 → 2 colonnes, sans carrousel ni doublon de liste grise", () => {
    const src = prest()
    // Cartes panoramiques (nettement plus larges que hautes) : 1 colonne sur
    // mobile, 2 colonnes dès `md`. Plus de 3ᵉ colonne (format paysage validé).
    expect(src).toMatch(/grid-cols-1/)
    expect(src).toMatch(/md:grid-cols-2/)
    expect(src).not.toMatch(/carousel|Carousel|embla|swiper/)
    // L'ancien bloc doublon « Découvrir toutes nos prestations » a été supprimé.
    expect(src).not.toMatch(/Découvrir toutes nos prestations/)
  })

  it("chaque carte mène à sa page de prestation dédiée (tenant conservé, pas de base)", () => {
    const src = prest()
    // Nouveau comportement approuvé : les cartes pointent vers les pages SEO
    // dédiées via un lien tenant-aware (serviceHref), et non plus vers l'ancre
    // du formulaire de devis.
    expect(src).toMatch(/href=\{serviceHref\(page\.slug\)\}/)
    // Vitrine éditoriale : aucun accès base / catalogue de prestations dans le
    // CODE (on cible des jetons de code, pas des mots présents en commentaire).
    expect(src).not.toMatch(/getServices|drizzle|basePriceCents|from ["']@\/lib\/db/)
  })

  it("ancre + lien de navigation « Prestations », rendu avant les réalisations", () => {
    const src = home()
    expect(src).toMatch(/SpiritPrestations/)
    expect(src).toMatch(/label: "Prestations"/)
    // La section prestations est rendue avant la section réalisations.
    expect(src.indexOf("SpiritPrestations")).toBeLessThan(src.indexOf("SpiritRealisations title="))
  })
})

describe("Spirit — section « Qui sommes-nous ? » (présentation dirigeant)", () => {
  const about = () => read(`${SPIRIT}/spirit-qui-sommes-nous.tsx`)
  const home = () => read(`${SPIRIT}/home-page.tsx`)

  it("le composant existe et est câblé dans l'accueil (ancre À propos conservée)", () => {
    expect(existsSync(path.join(root, SPIRIT, "spirit-qui-sommes-nous.tsx"))).toBe(true)
    const h = home()
    expect(h).toMatch(/SpiritQuiSommesNous/)
    // L'ancien composant générique n'est plus référencé.
    expect(h).not.toMatch(/SpiritApropos/)
    // Le libellé de navigation « À propos » reste présent.
    expect(h).toMatch(/label: "À propos"/)
  })

  it("affiche le contenu imposé (dirigeant, fonction, paragraphes, intitulé)", () => {
    const src = about()
    expect(src).toMatch(/À propos de Spirit ACS/)
    expect(src).toMatch(/Qui sommes-nous \?/)
    expect(src).toMatch(/Corentin Gisclon/)
    expect(src).toMatch(/Dirigeant de Spirit ACS/)
    expect(src).toMatch(/passionné par l’entretien esthétique/)
    // Initiales stylisées (aucun faux portrait) — CG sur sa propre ligne.
    expect(src).toMatch(/>\s*CG\s*</)
  })

  it("hiérarchie sémantique correcte : un <h2>, aucun <h1> dans la section", () => {
    const src = stripComments(about())
    expect((src.match(/<h2/g) ?? []).length).toBe(1)
    expect(src).not.toMatch(/<h1/)
    expect(about()).toMatch(/id=\{SPIRIT_SECTIONS\.apropos\}/)
  })

  it("bouton « Parler de votre véhicule » vers le formulaire (tenant conservé)", () => {
    const src = about()
    expect(src).toMatch(/Parler de votre véhicule/)
    // CtaButton conserve ?tenant= et pointe vers l'ancre du devis en page d'accueil.
    expect(src).toMatch(/CtaButton/)
    expect(src).toMatch(/SPIRIT_SECTIONS\.demandeDevis/)
  })

  it("aucune donnée non confirmée inventée (années, certifications, garanties…)", () => {
    // On analyse le contenu affiché (hors commentaires de documentation).
    const src = stripComments(about())
    expect(src).not.toMatch(/ans d'expérience|années d'expérience|depuis \d{4}|certifi|garanti|véhicules traités/i)
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
