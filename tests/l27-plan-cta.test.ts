import { describe, it, expect } from "vitest"
import { subscriptionPlanCta } from "@/lib/public-site-links"

describe("bouton des cartes de formules : parcours selon le réglage du pro, tenant conservé", () => {
  it("sur demande → formulaire de demande, tenant conservé", () => {
    expect(subscriptionPlanCta("request", "detailflow")).toEqual({ href: "/formules?tenant=detailflow", label: "Demander cette formule" })
  })
  it("souscription directe → contact du pro (aucun parcours direct en ligne), tenant conservé", () => {
    expect(subscriptionPlanCta("direct", "detailflow")).toEqual({ href: "/contact?tenant=detailflow", label: "Souscrire" })
  })
  it("tenant absent (sous-domaine résolu par l'hôte) : lien sans paramètre", () => {
    expect(subscriptionPlanCta("request", null).href).toBe("/formules")
    expect(subscriptionPlanCta("direct", null).href).toBe("/contact")
  })
  it("slug non sûr : jamais recopié dans le lien", () => {
    expect(subscriptionPlanCta("direct", "evil\"><script>").href).toBe("/contact")
  })
  it("plus jamais « Nous contacter pour souscrire »", () => {
    for (const mode of ["request", "direct"] as const) expect(subscriptionPlanCta(mode, "x").label).not.toMatch(/Nous contacter/)
  })
})
