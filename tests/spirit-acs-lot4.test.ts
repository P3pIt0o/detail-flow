import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

/**
 * Lot 4 Spirit ACS — invariants STRUCTURELS vérifiables sans rendu DOM
 * (environnement de test « node »). On lit le SOURCE des composants et on
 * vérifie les garanties du cahier des charges :
 *  - aucune section « prestations » ni parcours de réservation Spirit ;
 *  - aucun CTA Spirit vers /reservation ;
 *  - CTA d'ancres corrects (#demande-devis, #realisations) ;
 *  - Spirit affiche la VILLE (jamais `address`) ;
 *  - bouton WhatsApp partagé, normalisé, câblé dans le shell public.
 */

const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")
const SPIRIT = "components/custom-sites/spirit-acs"

describe("Spirit — assets (photo Hero + logo officiel)", () => {
  it("le hero utilise la VRAIE photo Porsche de l'atelier (aucune image IA générique)", () => {
    const hero = read(`${SPIRIT}/spirit-hero.tsx`)
    // Maquette validée : la Porsche 911 réelle (avec le totem Spirit) est le
    // visuel du hero — plus l'ancienne image générique bleue.
    expect(hero).toMatch(/\/custom-sites\/spirit-acs\/polissage-porsche-911\.jpg/)
    expect(hero).not.toMatch(/spirit-hero-v2\.webp/)
    expect(hero).toMatch(/priority/)
    expect(existsSync(path.join(root, "public/custom-sites/spirit-acs/polissage-porsche-911.jpg"))).toBe(true)
  })

  it("le logo de repli pointe vers le nouvel asset et l'ancien fichier à damier est supprimé", () => {
    const tokens = read(`${SPIRIT}/tokens.ts`)
    expect(tokens).toMatch(/\/custom-sites\/spirit-acs\/spirit-logo\.png/)
    expect(tokens).not.toMatch(/["'`]\/spirit-acs\/spirit-logo\.png/)
    expect(existsSync(path.join(root, "public/custom-sites/spirit-acs/spirit-logo.png"))).toBe(true)
    // Anciens assets génériques retirés.
    expect(existsSync(path.join(root, "public/spirit-acs/spirit-logo.png"))).toBe(false)
    expect(existsSync(path.join(root, "public/spirit-acs/hero.jpg"))).toBe(false)
  })

  it("le logo officiel possède un vrai canal alpha (PNG RGBA, pas de damier incrusté)", () => {
    const buf = readFileSync(path.join(root, "public/custom-sites/spirit-acs/spirit-logo.png"))
    // Signature PNG + IHDR colorType (offset 25) === 6 (RGBA).
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    expect(buf[25]).toBe(6)
  })
})

describe("Spirit — aucun catalogue en base ni parcours de réservation", () => {
  // NB : une section « prestations » VITRINE (familles de services, statique,
  // sans base ni tarif) a été (ré)introduite volontairement. Les invariants
  // ci-dessous portent sur ce qui reste interdit : le parcours de RÉSERVATION
  // et tout CATALOGUE branché en base (getServices).
  it("ne contient plus de composant de réservation", () => {
    expect(existsSync(path.join(root, SPIRIT, "spirit-reservation.tsx"))).toBe(false)
  })

  it("la section prestations est une VITRINE statique (aucun accès base / catalogue)", () => {
    const prest = read(`${SPIRIT}/spirit-prestations.tsx`)
    expect(prest).not.toMatch(/getServices|drizzle|basePriceCents|from ["']@\/lib\/db/)
  })

  it("la page ne branche ni réservation ni catalogue de services en base", () => {
    const home = read(`${SPIRIT}/home-page.tsx`)
    expect(home).not.toMatch(/SpiritReservation/)
    expect(home).not.toMatch(/getServices/)
  })
})

describe("Spirit — aucun CTA vers /reservation, ancres correctes", () => {
  // On cible un lien de ROUTE réel (`"/reservation"` entre guillemets), pas la
  // simple occurrence du mot dans un commentaire de documentation.
  const routeReservation = /["'`]\/reservation/

  it("le hero utilise les ancres devis + prestations (in-page), pas la route /reservation", () => {
    const hero = read(`${SPIRIT}/spirit-hero.tsx`)
    // Maquette validée : CTA principal « Demander un devis » (#demande-devis)
    // + CTA secondaire « Voir les prestations » (#prestations).
    expect(hero).toMatch(/demandeDevis/)
    expect(hero).toMatch(/prestations/)
    expect(hero).not.toMatch(routeReservation)
  })

  it("le CTA final ne pointe plus vers la route /reservation", () => {
    const cta = read(`${SPIRIT}/spirit-final-cta.tsx`)
    expect(cta).not.toMatch(routeReservation)
    expect(cta).toMatch(/demandeDevis/)
  })
})

describe("Spirit — localisation limitée à la ville", () => {
  it("le contrat public expose une ville dédiée", () => {
    const contact = read("lib/public-contact.ts")
    expect(contact).toMatch(/city:\s*string \| null/)
  })

  it("nav et CTA final s'en tiennent à la ville ; le footer expose l'adresse vérifiée", () => {
    // Nav + CTA final : localisation par la VILLE uniquement, aucune adresse
    // postale (prop `address` proscrite).
    for (const file of ["spirit-navigation.tsx", "spirit-final-cta.tsx"]) {
      const src = read(`${SPIRIT}/${file}`)
      expect(src).toMatch(/city/)
      expect(src).not.toMatch(/\baddress\b/)
    }
    // Footer : coordonnées complètes et VÉRIFIÉES de l'établissement — adresse
    // réelle issue de la constante `SPIRIT_BUSINESS`, rendue en <address>
    // sémantique (jamais une valeur inventée). La ville reste disponible.
    const footer = read(`${SPIRIT}/spirit-footer.tsx`)
    expect(footer).toMatch(/city/)
    expect(footer).toMatch(/SPIRIT_BUSINESS/)
    expect(footer).toMatch(/<address/)
  })
})

describe("WhatsApp — composant partagé, normalisé, câblé", () => {
  it("le bouton partagé normalise via le helper commun et a le bon libellé", () => {
    const btn = read("components/layout/whatsapp-button.tsx")
    expect(btn).toMatch(/toWhatsAppDigits/)
    expect(btn).toMatch(/Contacter sur WhatsApp/)
    expect(btn).toMatch(/wa\.me/)
    expect(btn).toMatch(/concernant mon véhicule/)
  })

  it("est monté pour les tenants standards (layout) ; les sites à shell propre le montent via leur shell", () => {
    const layout = read("app/(site)/layout.tsx")
    // Le layout ne rend plus que la branche standard (le shell Spirit monte le sien).
    expect(layout).toMatch(/phone=\{contact\.phoneRaw\}/)
    // Le site Spirit monte bien son propre bouton WhatsApp.
    const shell = read(`${SPIRIT}/site-shell.tsx`)
    expect(shell).toMatch(/<WhatsAppButton/)
  })
})
