import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Ajustements Spirit ACS (branche fix/spirit-acs-hero-reassurance-avis-contact)
 * — invariants STRUCTURELS vérifiables sans rendu DOM ni base :
 *
 *  1. Les 3 éléments de réassurance sont une SECTION indépendante (fond navy),
 *     hors de la zone image du hero.
 *  2. La ligne Google du hero tient sur UNE seule ligne (nowrap), sans troncature.
 *  3. Avis Google en français : langue configurable (défaut inchangé), texte
 *     localisé prioritaire + repli originalText, mention « Traduit par Google »
 *     conditionnelle, dates FR (relative Google ou fallback fr-FR).
 *  5. Adresse cliquable vers Google Maps UNIQUEMENT pour Spirit (autres tenants
 *     inchangés), avec target/rel sûrs et focus accessible.
 */

const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")
const SPIRIT = "components/custom-sites/spirit-acs"

describe("Spirit #1 — réassurance intégrée au bas du hero (maquette validée)", () => {
  it("le hero intègre les 4 repères de réassurance de la maquette", () => {
    const hero = read(`${SPIRIT}/spirit-hero.tsx`)
    expect(hero).toMatch(/Résultat professionnel/)
    expect(hero).toMatch(/Produits haut de gamme/)
    expect(hero).toMatch(/Pour tous types de véhicules/)
    expect(hero).toMatch(/et alentours/)
  })

  it("la home NE rend PLUS de bandeau de réassurance autonome (fusionné au hero)", () => {
    const home = read(`${SPIRIT}/home-page.tsx`)
    expect(home).not.toMatch(/<SpiritReassurance/)
  })
})

describe("Spirit #2 — composition du hero fidèle à la maquette", () => {
  const hero = () => read(`${SPIRIT}/spirit-hero.tsx`)

  it("expose les deux CTA de la maquette (Demander un devis + Voir les prestations)", () => {
    const src = hero()
    expect(src).toMatch(/Demander un devis/)
    expect(src).toMatch(/Voir les prestations/)
  })

  it("utilise une taille fluide (clamp) pour les libellés de repères sur petit mobile", () => {
    const src = hero()
    expect(src).toMatch(/clamp\(/)
  })

  it("emploie les dégradés sombres autour de la voiture (halos navy multi-couches)", () => {
    const src = hero()
    // Vignette radiale + voile latéral + fusion verticale (recette de la maquette).
    expect(src).toMatch(/radial-gradient\(/)
    expect(src).toMatch(/linear-gradient\(180deg/)
    expect(src).toMatch(/var\(--spirit-navy\)/)
  })
})

describe("Spirit #3 — avis Google en français", () => {
  it("le connecteur accepte languageCode optionnel et l'ajoute en query", () => {
    const src = read("lib/reviews/google-places.ts")
    expect(src).toMatch(/languageCode\?:\s*string/)
    expect(src).toMatch(/\?languageCode=/)
  })

  it("le connecteur n'impose AUCUNE langue par défaut (autres tenants inchangés)", () => {
    const src = read("lib/reviews/google-places.ts")
    // La query n'est ajoutée QUE si languageCode est fourni.
    expect(src).toMatch(/languageCode\s*\?\s*`\?languageCode=/)
  })

  it("le résolveur central propage languageCode", () => {
    const src = read("lib/reviews/public.ts")
    expect(src).toMatch(/languageCode\?:\s*string/)
    expect(src).toMatch(/languageCode:\s*opts\?\.languageCode/)
  })

  it("Spirit passe explicitement languageCode \"fr\" (avis + note)", () => {
    const src = read(`${SPIRIT}/home-page.tsx`)
    expect(src).toMatch(/languageCode:\s*"fr"/)
    expect(src).toMatch(/getTenantGoogleRating\(data\.tenant\.id,\s*\{\s*languageCode:\s*"fr"\s*\}\)/)
  })

  it("le composant privilégie le texte localisé puis originalText en repli", () => {
    const src = read("components/reviews/google-reviews-section.tsx")
    expect(src).toMatch(/const displayText = r\.text \?\? r\.originalText/)
    expect(src).toMatch(/\{displayText\}/)
  })

  it("« Traduit par Google » n'apparaît que si le texte affiché est la version localisée", () => {
    const src = read("components/reviews/google-reviews-section.tsx")
    expect(src).toMatch(/Boolean\(r\.text\) && Boolean\(r\.originalText\) && r\.originalLanguageCode !== r\.languageCode/)
  })

  it("les dates: relative Google d'abord, sinon fallback formaté fr-FR", () => {
    const src = read("components/reviews/google-reviews-section.tsx")
    expect(src).toMatch(/r\.relativePublishTime \?\?/)
    expect(src).toMatch(/toLocaleDateString\("fr-FR"/)
  })

  it("conserve auteur, note, lien « Voir sur Google » et attributions", () => {
    const src = read("components/reviews/google-reviews-section.tsx")
    expect(src).toMatch(/Voir sur Google/)
    expect(src).toMatch(/authorName/)
    expect(src).toMatch(/StarRating/)
  })
})

describe("Spirit #5 — adresse cliquable vers Google Maps (scopée Spirit)", () => {
  const contact = () => read("app/(site)/contact/page.tsx")

  it("le lien Maps n'est activé que pour le site spirit-acs", () => {
    const src = contact()
    expect(src).toMatch(/customSite\?\.key === "spirit-acs"/)
    expect(src).toMatch(/google\.com\/maps\/search/)
  })

  it("utilise l'adresse RÉELLE affichée (aucune valeur en dur)", () => {
    const src = contact()
    expect(src).toMatch(/encodeURIComponent\(contact\.address\)/)
  })

  it("les autres tenants gardent l'adresse non cliquable (href conditionnel)", () => {
    const src = contact()
    expect(src).toMatch(/addressMapsHref \? \{ href: addressMapsHref, external: true \} : \{\}/)
  })

  it("ouvre dans un nouvel onglet avec rel sûr et focus accessible", () => {
    const src = contact()
    expect(src).toMatch(/target: "_blank"/)
    expect(src).toMatch(/rel="noopener noreferrer"|rel: "noopener noreferrer"/)
    expect(src).toMatch(/focus-visible:ring/)
  })
})
