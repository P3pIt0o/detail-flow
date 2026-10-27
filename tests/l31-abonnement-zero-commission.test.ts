import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT, getCommercialPlanByLicensePlan } from "@/lib/pricing/plans"

/**
 * L31 — la carte Indépendant de « Mon abonnement » affiche « 0 % de commission »
 * sous « 30 jours gratuits », avec le texte des cartes de tarifs (même constante).
 */

const page = readFileSync(join(process.cwd(), "app/admin/(dashboard)/abonnement/page.tsx"), "utf8")

describe("A2 — texte identique aux cartes de tarifs", () => {
  it("valeur exacte validée en L29", () => {
    expect(INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT).toBe("0 % de commission sur vos paiements et abonnements")
  })

  it("les avantages de la carte Indépendant sont inchangés et utilisent la constante", () => {
    expect(getCommercialPlanByLicensePlan("PRO")?.highlights).toEqual([
      "Tout Essentiel",
      "Clients, devis et factures illimités",
      "Suivi des dépenses et analyse de rentabilité",
      "10 abonnements clients actifs",
      INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT,
      "Rappels & demandes d'avis automatiques",
      "Statistiques de base",
      "20 SMS crédités chaque mois · packs supplémentaires disponibles",
    ])
  })
})

describe("A1 — ligne sous « 30 jours gratuits », carte Indépendant seulement", () => {
  it("importe la constante, aucune chaîne en dur", () => {
    expect(page).toMatch(/INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT[^\n]*from "@\/lib\/pricing\/plans"|import \{[^}]*INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT[^}]*\} from "@\/lib\/pricing\/plans"/)
    expect(page).not.toMatch(/0 % de commission/)
  })

  it("rendue pour plan === \"PRO\", entre la ligne d'essai et « Sans carte bancaire »", () => {
    const trial = page.indexOf("jours gratuits`")
    const line = page.indexOf('plan === "PRO" ? (')
    const use = page.indexOf("{INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT}")
    const noCard = page.indexOf("Sans carte bancaire")
    expect(trial).toBeGreaterThan(-1)
    expect(line).toBeGreaterThan(trial)
    expect(use).toBeGreaterThan(line)
    expect(noCard).toBeGreaterThan(use)
  })
})

describe("A3 — bouton et prix inchangés", () => {
  it("bouton d'essai et prix toujours rendus de la même façon", () => {
    expect(page).toContain("<SaasCheckoutButton plan={plan} label={`Essayer ${name}`} featured={featured} />")
    expect(page).toContain("{euros(monthlyPriceCents)}")
  })
})
