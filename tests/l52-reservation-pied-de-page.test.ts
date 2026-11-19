import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: any) => createElement("a", { href, ...p }, children),
}))
vi.mock("@/components/report-problem-button", () => ({ ReportProblemButton: () => null }))
vi.mock("@/components/layout/logo", () => ({ Logo: () => null }))
vi.mock("../components/layout/logo", () => ({ Logo: () => null }))

const read = (p: string) => readFileSync(p, "utf8")

describe("L52 — réservation sous la barre fixe", () => {
  const src = read("app/(site)/reservation/page.tsx")
  it("non-néon : pt-24 md:pt-28, ancien pt-8 md:pt-12 supprimé", () => {
    expect(src).toContain("pb-16 pt-24 md:pb-20 md:pt-28")
    expect(src).not.toContain("pt-8 md:pt-12")
  })
  it("embed et néon inchangés", () => {
    expect(src).toContain('"bg-background py-6"')
    expect(src).toContain("pb-16 pt-4 md:pb-20")
  })
  it("view=both : pas de double décalage", () => {
    expect(src).toContain('view === "both" ? "bg-background pb-16 pt-8')
  })

  const pages = [
    "app/(site)/demande/page.tsx",
    "app/(site)/demande/[token]/page.tsx",
    "app/(site)/demande/confirmation/page.tsx",
    "app/(site)/reservation/confirmation/page.tsx",
    "app/(site)/reservation/gerer/[token]/page.tsx",
    "app/(site)/reservation/paiement/[bookingId]/page.tsx",
    "app/(site)/reservation/paiement/[bookingId]/retour/page.tsx",
  ]
  it.each(pages)("%s dégage la barre", (p) => {
    const s = read(p)
    expect(s).toContain("pb-16 pt-24 md:pt-28")
    expect(s).not.toMatch(/bg-background py-1[26]"/)
  })
})

describe("L52 — slogan du pied de page", () => {
  it("tenant sans slogan : pas de slogan DetailFlow", async () => {
    const { Footer } = await import("@/components/layout/footer")
    const { siteConfig } = await import("@/config/site")
    const html = renderToStaticMarkup(createElement(Footer, { brandName: "Mon Studio", tenantSlug: "studio" }))
    expect(html).not.toContain(siteConfig.brand.tagline)
  })
  it("tenant avec slogan : le sien", async () => {
    const { Footer } = await import("@/components/layout/footer")
    const html = renderToStaticMarkup(
      createElement(Footer, { brandName: "Mon Studio", tenantSlug: "studio", footerTagline: "Mon slogan" }),
    )
    expect(html).toContain("Mon slogan")
  })
  it("sans tenant : slogan DetailFlow", async () => {
    const { Footer } = await import("@/components/layout/footer")
    const { siteConfig } = await import("@/config/site")
    expect(renderToStaticMarkup(createElement(Footer))).toContain(siteConfig.brand.tagline)
  })
})
