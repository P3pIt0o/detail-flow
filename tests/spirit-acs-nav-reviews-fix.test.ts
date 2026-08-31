import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Correctifs Spirit ACS (branche fix/spirit-acs-nav-reviews-cta) — invariants
 * STRUCTURELS vérifiables sans rendu DOM ni base de données :
 *  1. Navigation in-page opérante (handler partagé : ferme le menu, lève le
 *     verrou de scroll, défile avec l'offset d'en-tête, conserve ?tenant=) ;
 *  2. Bloc final redondant « PRÊT À FAIRE BRILLER » retiré de la page, ancre
 *     #contact rattachée aux coordonnées du footer ;
 *  3. Avis résolus par la SOURCE choisie (manuel vs Google) via le résolveur
 *     central, au lieu de n'afficher que les avis manuels.
 */

const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")
const SPIRIT = "components/custom-sites/spirit-acs"

describe("Spirit — navigation in-page opérante (#1)", () => {
  const nav = () => read(`${SPIRIT}/spirit-navigation.tsx`)

  it("expose un handler d'ancre partagé qui ferme le menu et lève le verrou de scroll", () => {
    const src = nav()
    expect(src).toMatch(/handleAnchorClick/)
    expect(src).toMatch(/setOpen\(false\)/)
    // Verrou de scroll levé de façon synchrone au clic (corrige le saut clampé).
    expect(src).toMatch(/document\.body\.style\.overflow\s*=\s*""/)
    // Défilement effectif vers la cible.
    expect(src).toMatch(/scrollIntoView/)
  })

  it("le handler est câblé sur les liens/CTA bureau ET mobile", () => {
    const src = nav()
    const wired = src.match(/onClick=\{\(e\) => handleAnchorClick\(/g) ?? []
    // 2 liens (desktop + mobile) + 2 CTA (desktop + mobile) = 4 câblages.
    expect(wired.length).toBeGreaterThanOrEqual(4)
  })

  it("ne défile que sur une ancre existante et conserve le contexte tenant (hash only)", () => {
    const src = nav()
    // Ancre uniquement (les liens de route gardent leur comportement standard).
    expect(src).toMatch(/if \(!href\.startsWith\("#"\)\) return/)
    // On ne touche qu'au hash → ?tenant= intégralement préservé.
    expect(src).toMatch(/history\.replaceState\(null, "", href\)/)
    expect(src).not.toMatch(/window\.location\.href\s*=/)
  })
})

describe("Spirit — bloc final redondant retiré, #contact vers le footer (#2)", () => {
  it("la page n'affiche plus le bloc final « PRÊT À FAIRE BRILLER » (SpiritFinalCta)", () => {
    const home = read(`${SPIRIT}/home-page.tsx`)
    expect(home).not.toMatch(/SpiritFinalCta/)
  })

  it("le footer porte l'ancre #contact sur les coordonnées existantes", () => {
    const footer = read(`${SPIRIT}/spirit-footer.tsx`)
    expect(footer).toMatch(/id=\{SPIRIT_SECTIONS\.contact\}/)
    expect(footer).toMatch(/data-spirit-anchor/)
    // Les coordonnées réelles restent présentes (téléphone / email / ville).
    expect(footer).toMatch(/toTelHref/)
    expect(footer).toMatch(/mailto:/)
  })
})

describe("Spirit — avis résolus par la source choisie (#3)", () => {
  const home = () => read(`${SPIRIT}/home-page.tsx`)

  it("la page passe par le résolveur central resolveTenantReviews (scopé tenant)", () => {
    const src = home()
    expect(src).toMatch(/resolveTenantReviews\(data\.tenant\.id/)
    // Réutilise les avis manuels déjà chargés (évite une 2ᵉ requête).
    expect(src).toMatch(/manualReviews:\s*reviews/)
  })

  it("rend les avis manuels OU les avis Google réels selon la source", () => {
    const src = home()
    expect(src).toMatch(/reviewsResolved\.source === "manual"/)
    expect(src).toMatch(/reviewsResolved\.source === "google"/)
    expect(src).toMatch(/<SpiritAvisGoogle/)
  })

  it("la variante Google réutilise le composant partagé (aucun fork, aucune donnée inventée)", () => {
    const g = read(`${SPIRIT}/spirit-avis-google.tsx`)
    expect(g).toMatch(/GoogleReviewsSection/)
    // Aucune clé API ni appel réseau dans le composant de rendu.
    expect(g).not.toMatch(/GOOGLE_MAPS_API_KEY|fetch\(/)
  })
})
