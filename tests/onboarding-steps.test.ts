import { describe, it, expect } from "vitest"
import { computeOnboardingSteps, type OnboardingSignals } from "@/lib/onboarding/steps"

const NONE: OnboardingSignals = {
  companyInfoComplete: false,
  billingConfirmed: false,
  hasService: false,
  hasAvailability: false,
  publicSiteComplete: false,
  hasBooking: false,
}

const ALL: OnboardingSignals = {
  companyInfoComplete: true,
  billingConfirmed: true,
  hasService: true,
  hasAvailability: true,
  publicSiteComplete: true,
  hasBooking: true,
}

describe("computeOnboardingSteps", () => {
  it("expose 6 étapes stables avec un lien direct chacune", () => {
    const r = computeOnboardingSteps(NONE)
    expect(r.total).toBe(6)
    expect(r.steps).toHaveLength(6)
    for (const s of r.steps) {
      expect(s.href.startsWith("/admin/")).toBe(true)
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(0)
    }
  })

  it("liens pointent vers les bons écrans / onglets", () => {
    const byKey = Object.fromEntries(computeOnboardingSteps(NONE).steps.map((s) => [s.key, s.href]))
    expect(byKey.company).toBe("/admin/parametres?tab=business")
    expect(byKey.billing).toBe("/admin/parametres?tab=invoicing")
    expect(byKey.service).toBe("/admin/prestations")
    expect(byKey.availability).toBe("/admin/parametres?tab=hours")
    expect(byKey.publicSite).toBe("/admin/parametres?tab=site")
    expect(byKey.booking).toBe("/admin/reservations")
  })

  it("progression = 0 quand aucun signal", () => {
    const r = computeOnboardingSteps(NONE)
    expect(r.doneCount).toBe(0)
    expect(r.percent).toBe(0)
    expect(r.allDone).toBe(false)
    expect(r.steps.every((s) => !s.done)).toBe(true)
  })

  it("progression = 100 % et allDone quand tout est validé", () => {
    const r = computeOnboardingSteps(ALL)
    expect(r.doneCount).toBe(6)
    expect(r.percent).toBe(100)
    expect(r.allDone).toBe(true)
    expect(r.steps.every((s) => s.done)).toBe(true)
  })

  it("validation automatique : chaque signal coche exactement son étape", () => {
    const r = computeOnboardingSteps({ ...NONE, billingConfirmed: true })
    expect(r.doneCount).toBe(1)
    expect(r.percent).toBe(17)
    expect(r.steps.find((s) => s.key === "billing")?.done).toBe(true)
    expect(r.steps.find((s) => s.key === "company")?.done).toBe(false)
  })
})
