import { describe, it, expect, vi } from "vitest"

/**
 * L86 — L'aperçu de partage de `/carte` (WhatsApp, Instagram, SMS, écran d'accueil) porte
 * l'identité du tenant, jamais les balises DetailFlow héritées du layout racine.
 */

const h = vi.hoisted(() => ({ data: null as null | Record<string, unknown> }))

vi.mock("@/lib/digital-card.server", () => ({ loadPublicDigitalCard: async () => h.data }))

import { generateMetadata } from "@/app/carte/page"

const card = (slug: string, name: string, logo: boolean) => ({
  slug,
  name,
  line: "Detailing à Annecy",
  logoSrc: logo ? `/api/company-logo?company=${slug}` : null,
})

/** Textes de marque, hors URL (canonique et logo hébergés sur detailflow.fr sans domaine dédié). */
const branding = (meta: Record<string, any>) =>
  JSON.stringify([
    meta.title,
    meta.description,
    meta.applicationName,
    meta.appleWebApp,
    meta.openGraph?.siteName,
    meta.openGraph?.title,
    meta.openGraph?.description,
    meta.twitter?.title,
    meta.twitter?.description,
  ])

describe("L86 métadonnées de /carte", () => {
  it("titre, description, partage et écran d'accueil au nom du tenant, avec son logo", async () => {
    h.data = card("alpha", "Alpha Detailing", true)
    const meta = (await generateMetadata()) as Record<string, any>

    expect(meta.title).toEqual({ absolute: "Alpha Detailing" })
    expect(meta.description).toBe("Detailing à Annecy")
    expect(meta.openGraph.siteName).toBe("Alpha Detailing")
    expect(meta.openGraph.title).toBe("Alpha Detailing")
    expect(meta.openGraph.images[0].url).toMatch(/\/api\/company-logo\?company=alpha$/)
    expect(meta.twitter.card).toBe("summary")
    expect(meta.appleWebApp.title).toBe("Alpha Detailing")
    expect(meta.manifest).toBeNull()
    expect(meta.alternates.canonical).toMatch(/\/carte\?tenant=alpha$/)
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(branding(meta)).not.toMatch(/detailflow/i)
  })

  it("sans logo : aucune image (surtout pas celle de DetailFlow)", async () => {
    h.data = { ...card("bravo", "Bravo Clean", false), line: null }
    const meta = (await generateMetadata()) as Record<string, any>

    expect(meta.openGraph.images).toEqual([])
    expect(meta.twitter.images).toEqual([])
    expect(meta.description).toContain("Bravo Clean")
    expect(JSON.stringify(meta)).not.toContain("alpha")
  })

  it("domaine dédié : canonique sur le domaine du tenant", async () => {
    h.data = card("cleanyzer", "CLEANYZER", true)
    const meta = (await generateMetadata()) as Record<string, any>

    expect(meta.alternates.canonical).toBe("https://www.cleanyzer.fr/carte")
    expect(meta.openGraph.images[0].url).toBe("https://www.cleanyzer.fr/api/company-logo?company=cleanyzer")
  })

  it("carte introuvable : rien d'autre que noindex", async () => {
    h.data = null
    expect(await generateMetadata()).toEqual({ robots: { index: false, follow: false } })
  })
})
