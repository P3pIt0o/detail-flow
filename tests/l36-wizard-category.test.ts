import { describe, it, expect, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock("@/app/admin/(dashboard)/abonnements-clients/actions", () => ({ saveWizardPlanAction: vi.fn(), archivePlanAction: vi.fn() }))

import { PlanWizard } from "@/components/admin/customer-subscriptions/plan-wizard"
import { DEFAULT_WIZARD_FORM, wizardVehicleTypeChange } from "@/lib/customer-subscriptions/plan-form"

/** L36 (correction) : une catégorie n'est envoyée que si le pro l'a changée ; une catégorie inactive reste affichée et conservée. */

describe("wizardVehicleTypeChange", () => {
  it("non modifiée → undefined (inchangée côté serveur), y compris une catégorie inactive", () => {
    expect(wizardVehicleTypeChange({ vehicleTypeId: null }, { vehicleTypeId: null })).toBeUndefined()
    expect(wizardVehicleTypeChange({ vehicleTypeId: 99 }, { vehicleTypeId: 99 })).toBeUndefined()
    expect(wizardVehicleTypeChange({}, { vehicleTypeId: null })).toBeUndefined()
  })

  it("modifiée → la nouvelle valeur, null = effacement explicite", () => {
    expect(wizardVehicleTypeChange({ vehicleTypeId: null }, { vehicleTypeId: 3 })).toBe(3)
    expect(wizardVehicleTypeChange({ vehicleTypeId: 99 }, { vehicleTypeId: 3 })).toBe(3)
    expect(wizardVehicleTypeChange({ vehicleTypeId: 99 }, { vehicleTypeId: null })).toBeNull()
  })
})

const render = (vehicleTypeId: number | null, vehicleTypes: { id: number; name: string }[]) =>
  renderToStaticMarkup(
    createElement(PlanWizard, {
      planId: 1,
      initial: { ...DEFAULT_WIZARD_FORM, name: "Confort", vehicleTypeId },
      services: [],
      paymentsReady: true,
      hasSubscribers: false,
      publicMode: "request",
      vehicleTypes,
    }),
  )

describe("PlanWizard — champ catégorie (rendu réel)", () => {
  it("catégorie enregistrée inactive : « Catégorie inactive » sélectionnée, pas « Toutes les catégories »", () => {
    const html = render(99, [{ id: 1, name: "Citadine" }])
    expect(html).toMatch(/<option value="99" selected="">Catégorie inactive<\/option>/)
    const select = html.match(/<select id="vehicleType"[\s\S]*?<\/select>/)?.[0] ?? ""
    expect(select).toContain('<option value="">Toutes les catégories</option>')
  })

  it("champ affiché même si le tenant n'a plus aucune catégorie active, tant qu'une catégorie inactive est enregistrée", () => {
    expect(render(99, [])).toContain("Catégorie inactive")
  })

  it("catégorie active : pas d'option « Catégorie inactive » ; aucune catégorie : champ masqué", () => {
    const html = render(1, [{ id: 1, name: "Citadine" }])
    expect(html).toMatch(/<option value="1" selected="">Citadine<\/option>/)
    expect(html).not.toContain("Catégorie inactive")
    expect(render(null, [])).not.toContain("Catégorie de véhicule")
  })

  it("description saisissable à l'étape « La formule »", () => {
    const html = render(null, [])
    expect(html).toContain("Description (facultatif)")
    expect(html).toContain('maxLength="2000"')
  })
})
