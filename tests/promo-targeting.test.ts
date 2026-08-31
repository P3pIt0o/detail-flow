import { describe, it, expect, vi } from "vitest"
import type { QuoteLine } from "@/lib/booking/types"

// Le module promo importe la couche DB au chargement ; les fonctions testées
// ici sont PURES et n'y touchent pas. On neutralise donc l'accès réseau.
vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/db/schema", () => ({ promoCodes: {} }))

const { computePromoEligibleSubtotal, computeDiscountCents } = await import("@/lib/promo/service")

/**
 * LOT C — assiette des codes promo ciblés « certaines prestations ».
 * Logique PURE (aucune DB). Toutes les valeurs sont en centimes (unités
 * mineures) conformément au moteur.
 */

function line(serviceId: number, priceCents: number, optionCents = 0): QuoteLine {
  return {
    uid: `u${serviceId}`,
    serviceId,
    serviceName: `S${serviceId}`,
    vehicleTypeId: 1,
    vehicleTypeName: "VT",
    priceCents,
    durationMin: 60,
    options: optionCents
      ? [{ optionId: 1, optionName: "opt", priceCents: optionCents, durationMin: 10 }]
      : [],
    lineTotalCents: priceCents + optionCents,
    lineDurationMin: 60 + (optionCents ? 10 : 0),
  }
}

/** Reconstruit servicesCents/optionsCents comme le moteur. */
function quoteOf(lines: QuoteLine[]) {
  const servicesCents = lines.reduce((s, l) => s + l.priceCents, 0)
  const optionsCents = lines.reduce((s, l) => s + l.options.reduce((a, o) => a + o.priceCents, 0), 0)
  return { lines, servicesCents, optionsCents }
}

describe("assiette — promo GLOBALE (rétrocompatibilité)", () => {
  it("rules null => services + options (comportement historique)", () => {
    const q = quoteOf([line(1, 5000, 1000), line(2, 3000)])
    expect(computePromoEligibleSubtotal(q, null)).toBe(9000)
  })

  it("rules avec serviceIds vide => traité comme global", () => {
    const q = quoteOf([line(1, 5000, 1000)])
    expect(computePromoEligibleSubtotal(q, { serviceIds: [] })).toBe(6000)
  })
})

describe("assiette — promo CIBLÉE certaines prestations", () => {
  it("panier mixte : seules les lignes ciblées comptent (options exclues)", () => {
    // Service 1 ciblé (5000 + option 1000), service 2 non ciblé (3000).
    const q = quoteOf([line(1, 5000, 1000), line(2, 3000)])
    // Assiette = prix prestation ciblée UNIQUEMENT (5000), options exclues.
    expect(computePromoEligibleSubtotal(q, { serviceIds: [1] })).toBe(5000)
  })

  it("plusieurs prestations ciblées : somme des prix éligibles", () => {
    const q = quoteOf([line(1, 5000), line(2, 3000), line(3, 2000)])
    expect(computePromoEligibleSubtotal(q, { serviceIds: [1, 3] })).toBe(7000)
  })

  it("aucune prestation éligible dans le panier => assiette 0", () => {
    const q = quoteOf([line(2, 3000)])
    expect(computePromoEligibleSubtotal(q, { serviceIds: [1] })).toBe(0)
  })

  it("le déplacement n'entre jamais dans l'assiette (non présent dans les lignes)", () => {
    const q = quoteOf([line(1, 4000)])
    // Le fee de déplacement est hors lignes : rien à exclure explicitement ici,
    // l'assiette ciblée = prix prestation.
    expect(computePromoEligibleSubtotal(q, { serviceIds: [1] })).toBe(4000)
  })
})

describe("remise — plafonnement et unités mineures", () => {
  it("remise fixe plafonnée à l'assiette éligible (jamais de total négatif)", () => {
    // Assiette ciblée 5000, remise fixe 8000 => plafonnée à 5000.
    expect(computeDiscountCents("fixed", 8000, 5000)).toBe(5000)
  })

  it("remise fixe inférieure à l'assiette : appliquée telle quelle", () => {
    expect(computeDiscountCents("fixed", 2000, 5000)).toBe(2000)
  })

  it("remise pourcentage : arrondi cohérent en centimes", () => {
    // 10% de 5001 = 500,1 => 500 (arrondi).
    expect(computeDiscountCents("percent", 10, 5001)).toBe(500)
  })

  it("remise sur assiette 0 => 0 (jamais négatif)", () => {
    expect(computeDiscountCents("fixed", 2000, 0)).toBe(0)
    expect(computeDiscountCents("percent", 50, 0)).toBe(0)
  })
})
