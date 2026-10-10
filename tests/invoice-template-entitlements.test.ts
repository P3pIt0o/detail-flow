
import { describe, it, expect } from "vitest"
import { planFeature } from "@/lib/licensing/registry"
import type { LicensePlan } from "@/lib/licensing/types"

type Rights = [LicensePlan, boolean, boolean, boolean]

const plans: Rights[] = [
  ["FREE", false, false, false],
  ["ESSENTIAL", false, false, false],
  ["PRO", true, false, false],
  ["BUSINESS", true, true, true],
  ["ENTERPRISE", true, true, true],
  ["FOUNDER", true, true, true],
]

describe("Factur-X C3 - personnalisation par abonnement", () => {
  it.each(plans)(
    "%s : logo / modele / photo",
    (plan, logo, template, photo) => {
      expect(planFeature(plan, "invoice_logo")).toBe(logo)
      expect(planFeature(plan, "invoice_template_choice")).toBe(template)
      expect(planFeature(plan, "invoice_photo")).toBe(photo)
    }
  )
})
