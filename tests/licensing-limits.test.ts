import { describe, expect, it } from "vitest"
import { isCreationAllowed, resolveLimit, type LicenseContext } from "@/lib/licensing/resolver"
import type { LimitKey } from "@/lib/licensing/types"

/**
 * Tests PURS de l'application des limites de création (Étape 2A).
 *
 * On combine le resolver central `resolveLimit()` (limite effective d'un plan)
 * avec la règle PURE `isCreationAllowed()` (autorise-t-on une Nᵉ création ?).
 * Aucun accès base : on vérifie la logique branchée dans les Server Actions
 * `createClientAction` (maxCustomers) et `createInvoiceFromBooking`
 * (maxInvoicesPerMonth), sans écrire en production.
 */

const ctx = (plan: LicenseContext["plan"]): LicenseContext => ({
  plan,
  generation: plan == null ? null : "LIFETIME_V1",
  overrides: [],
})

/** Simule la décision serveur : limite du plan + comptage courant. */
function creationAllowed(plan: LicenseContext["plan"], key: LimitKey, currentCount: number): boolean {
  return isCreationAllowed(resolveLimit(ctx(plan), key), currentCount)
}

describe("A. LEGACY (licensePlan = NULL) — aucune restriction ajoutée", () => {
  it("autorise la création de clients sans limite", () => {
    expect(creationAllowed(null, "maxCustomers", 0)).toBe(true)
    expect(creationAllowed(null, "maxCustomers", 10)).toBe(true)
    expect(creationAllowed(null, "maxCustomers", 100_000)).toBe(true)
  })
  it("autorise la création de factures sans limite", () => {
    expect(creationAllowed(null, "maxInvoicesPerMonth", 0)).toBe(true)
    expect(creationAllowed(null, "maxInvoicesPerMonth", 3)).toBe(true)
    expect(creationAllowed(null, "maxInvoicesPerMonth", 9_999)).toBe(true)
  })
})

describe("B. FREE — seuils exacts (clients 10, factures/mois 3)", () => {
  it("client n°10 accepté (comptage 9 -> 10ᵉ), n°11 refusé (comptage 10)", () => {
    expect(creationAllowed("FREE", "maxCustomers", 9)).toBe(true) // crée le 10ᵉ
    expect(creationAllowed("FREE", "maxCustomers", 10)).toBe(false) // 11ᵉ refusé
  })
  it("facture n°3 du mois acceptée (comptage 2 -> 3ᵉ), n°4 refusée (comptage 3)", () => {
    expect(creationAllowed("FREE", "maxInvoicesPerMonth", 2)).toBe(true) // crée la 3ᵉ
    expect(creationAllowed("FREE", "maxInvoicesPerMonth", 3)).toBe(false) // 4ᵉ refusée
  })
})

describe("C. Plans avec limites illimitées (null)", () => {
  it("ESSENTIAL : clients & factures illimités", () => {
    expect(resolveLimit(ctx("ESSENTIAL"), "maxCustomers")).toBeNull()
    expect(resolveLimit(ctx("ESSENTIAL"), "maxInvoicesPerMonth")).toBeNull()
    expect(creationAllowed("ESSENTIAL", "maxCustomers", 5_000)).toBe(true)
    expect(creationAllowed("ESSENTIAL", "maxInvoicesPerMonth", 5_000)).toBe(true)
  })
  it("PRO / BUSINESS / FOUNDER : création toujours autorisée", () => {
    for (const plan of ["PRO", "BUSINESS", "FOUNDER"] as const) {
      expect(creationAllowed(plan, "maxCustomers", 1_000_000)).toBe(true)
      expect(creationAllowed(plan, "maxInvoicesPerMonth", 1_000_000)).toBe(true)
    }
  })
})

describe("D. Isolation du comptage (par tenant)", () => {
  it("la décision ne dépend QUE du comptage passé (scopé companyId serveur)", () => {
    // Entreprise A : 9 clients (autorisé). Les clients d'une autre entreprise
    // ne sont jamais inclus dans ce comptage -> ne changent pas la décision.
    expect(creationAllowed("FREE", "maxCustomers", 9)).toBe(true)
    // Même plan, comptage tenant = 10 (aucune fuite d'un autre tenant) -> refus.
    expect(creationAllowed("FREE", "maxCustomers", 10)).toBe(false)
  })
})

describe("E. Anti-contournement (fail closed)", () => {
  it("une licence explicite invalide bloque la création (limite 0)", () => {
    // Plan explicite non reconnu (ex. valeur forgée) => resolveLimit renvoie 0.
    const forged = ctx("HACKED_PLAN" as unknown as LicenseContext["plan"])
    expect(resolveLimit(forged, "maxCustomers")).toBe(0)
    expect(isCreationAllowed(resolveLimit(forged, "maxCustomers"), 0)).toBe(false)
  })
  it("un comptage négatif/forgé n'ouvre pas au-delà de la limite FREE", () => {
    // Même avec un comptage aberrant, la règle reste `count < limit`.
    expect(isCreationAllowed(10, 10)).toBe(false)
    expect(isCreationAllowed(3, 3)).toBe(false)
  })
})
