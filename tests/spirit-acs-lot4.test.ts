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

describe("Spirit — suppression des prestations et de la réservation", () => {
  it("ne contient plus les composants prestations / réservation", () => {
    expect(existsSync(path.join(root, SPIRIT, "spirit-prestations.tsx"))).toBe(false)
    expect(existsSync(path.join(root, SPIRIT, "spirit-reservation.tsx"))).toBe(false)
  })

  it("la page n'importe ni prestations ni réservation", () => {
    const home = read(`${SPIRIT}/home-page.tsx`)
    expect(home).not.toMatch(/SpiritPrestations/)
    expect(home).not.toMatch(/SpiritReservation/)
    expect(home).not.toMatch(/getServices/)
  })
})

describe("Spirit — aucun CTA vers /reservation, ancres correctes", () => {
  // On cible un lien de ROUTE réel (`"/reservation"` entre guillemets), pas la
  // simple occurrence du mot dans un commentaire de documentation.
  const routeReservation = /["'`]\/reservation/

  it("le hero utilise les ancres devis + réalisations, pas la route /reservation", () => {
    const hero = read(`${SPIRIT}/spirit-hero.tsx`)
    expect(hero).toMatch(/demandeDevis/)
    expect(hero).toMatch(/realisations/)
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

  it("nav, footer et CTA final affichent la ville (jamais l'adresse exacte)", () => {
    for (const file of ["spirit-navigation.tsx", "spirit-footer.tsx", "spirit-final-cta.tsx"]) {
      const src = read(`${SPIRIT}/${file}`)
      expect(src).toMatch(/city/)
      // Plus aucune prop `address` résiduelle dans ces composants Spirit.
      expect(src).not.toMatch(/\baddress\b/)
    }
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

  it("est monté dans le shell public commun, y compris pour les sites à shell propre (Spirit)", () => {
    const layout = read("app/(site)/layout.tsx")
    const mounts = layout.match(/<WhatsAppButton/g) ?? []
    // Une occurrence pour le shell standard + une pour le shell personnalisé.
    expect(mounts.length).toBeGreaterThanOrEqual(2)
    expect(layout).toMatch(/phone=\{contact\.phoneRaw\}/)
  })
})
