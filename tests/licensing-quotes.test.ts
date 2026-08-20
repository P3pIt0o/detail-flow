import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { resolveLimit, isCreationAllowed } from "@/lib/licensing/resolver"
import type { LicenseContext } from "@/lib/licensing/resolver"

/**
 * Lot 5 — maxQuotesPerMonth branché sur sendProposalAction (PREMIER devis).
 *
 * Ces tests couvrent :
 *  1. la décision PURE de la limite (matrice centrale) ;
 *  2. la logique "premier envoi vs renvoi" (proposalSentAt) ;
 *  3. des garanties STRUCTURELLES : demande publique non gatée, proposalSentAt
 *     immuable au renvoi, comptage scopé companyId, tenant serveur uniquement.
 */

function ctx(plan: LicenseContext["plan"]): LicenseContext {
  return { plan, generation: plan == null ? null : "LIFETIME_V1", overrides: [] }
}

// ------------------------------------------------------------------
// 1. Décision de limite (règle pure + matrice centrale)
// ------------------------------------------------------------------
describe("maxQuotesPerMonth — matrice & règle de création", () => {
  it("LEGACY (plan null) => illimité : aucune nouvelle restriction", () => {
    const limit = resolveLimit(ctx(null), "maxQuotesPerMonth")
    expect(limit).toBeNull()
    expect(isCreationAllowed(limit, 999)).toBe(true)
  })

  it("FREE = 3/mois : le 3ᵉ devis passe (count=2), le 4ᵉ est refusé (count=3)", () => {
    const limit = resolveLimit(ctx("FREE"), "maxQuotesPerMonth")
    expect(limit).toBe(3)
    expect(isCreationAllowed(limit, 2)).toBe(true) // devis n°3
    expect(isCreationAllowed(limit, 3)).toBe(false) // devis n°4
  })

  it("PRO / BUSINESS / FOUNDER => illimité", () => {
    for (const plan of ["PRO", "BUSINESS", "FOUNDER"] as const) {
      expect(resolveLimit(ctx(plan), "maxQuotesPerMonth")).toBeNull()
    }
  })
})

// ------------------------------------------------------------------
// 2. Logique "premier envoi vs renvoi" (reproduit la condition du serveur)
// ------------------------------------------------------------------
describe("maxQuotesPerMonth — premier envoi vs renvoi", () => {
  // Réplique exacte de la condition serveur : isFirstProposal = proposalSentAt == null
  const isFirstProposal = (proposalSentAt: Date | null) => proposalSentAt == null

  it("proposalSentAt NULL => premier devis (quota consommé)", () => {
    expect(isFirstProposal(null)).toBe(true)
  })

  it("proposalSentAt renseigné => renvoi/modification (aucun quota)", () => {
    expect(isFirstProposal(new Date("2026-01-02T09:00:00.000Z"))).toBe(false)
  })
})

// ------------------------------------------------------------------
// 3. Garanties structurelles (le code réel respecte le cahier des charges)
// ------------------------------------------------------------------
describe("maxQuotesPerMonth — garanties structurelles", () => {
  const root = resolve(__dirname, "..")
  const proposalActions = readFileSync(
    resolve(root, "app/admin/(dashboard)/demandes/actions.ts"),
    "utf8",
  )
  const publicSubmit = readFileSync(resolve(root, "app/(site)/demande/actions.ts"), "utf8")

  it("sendProposalAction applique bien maxQuotesPerMonth via canCreateWithinLimit", () => {
    expect(proposalActions).toContain("canCreateWithinLimit")
    expect(proposalActions).toContain('"maxQuotesPerMonth"')
    expect(proposalActions).toContain("LIMIT_REACHED_MESSAGE")
  })

  it("le gate ne s'applique QUE au premier envoi (isFirstProposal)", () => {
    expect(proposalActions).toContain("isFirstProposal")
    // Le comptage n'a lieu que dans la branche premier envoi.
    expect(proposalActions).toMatch(/if\s*\(\s*isFirstProposal\s*\)/)
  })

  it("proposalSentAt est CONSERVÉ au renvoi (posé uniquement au premier envoi)", () => {
    // Le champ n'est écrit que conditionnellement au premier envoi.
    expect(proposalActions).toMatch(/isFirstProposal\s*\?\s*\{\s*proposalSentAt/)
  })

  it("le comptage mensuel est scopé companyId serveur (isolation, anti-IDOR)", () => {
    expect(proposalActions).toContain("eq(customRequests.companyId, tenant.id)")
    expect(proposalActions).toContain("gte(customRequests.proposalSentAt, monthStart)")
    // Le companyId vient du tenant serveur, jamais du client.
    expect(proposalActions).toContain("requireCompanyMember()")
  })

  it("la demande PUBLIQUE (submitCustomRequest) n'est JAMAIS gatée par maxQuotesPerMonth", () => {
    expect(publicSubmit).not.toContain("maxQuotesPerMonth")
    expect(publicSubmit).not.toContain("canCreateWithinLimit")
  })

  it("convertToBookingAction n'est pas gaté par maxQuotesPerMonth", () => {
    // Extrait la fonction de conversion et vérifie l'absence de la limite dedans.
    const idx = proposalActions.indexOf("export async function convertToBookingAction")
    expect(idx).toBeGreaterThan(-1)
    const convertBody = proposalActions.slice(idx)
    expect(convertBody).not.toContain("maxQuotesPerMonth")
  })
})
