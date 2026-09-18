import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { buildTenantPageMetadata } from "@/lib/seo/tenant-metadata"
import { tenantSeoIdentity, resolveTenantOrigin } from "@/lib/seo/tenant-url"

const OG_PATH = join(process.cwd(), "public/custom-sites/spirit-acs/og-spirit-acs.png")

/** Lit les dimensions d'un PNG via son bloc IHDR (sans dépendance externe). */
function pngSize(buf: Buffer): { width: number; height: number } {
  // Signature PNG (8) + longueur (4) + "IHDR" (4) → largeur/hauteur en BE.
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe("Spirit ACS — image Open Graph (logo, pas de photo Porsche)", () => {
  it("l'image OG existe et respecte le format social 1200×630", () => {
    expect(existsSync(OG_PATH)).toBe(true)
    const { width, height } = pngSize(readFileSync(OG_PATH))
    expect({ width, height }).toEqual({ width: 1200, height: 630 })
  })
})

describe("Spirit ACS — metadata sociales sur le domaine canonique", () => {
  // Identité identique à celle injectée en prod par resolveTenantSeo.
  const identity = tenantSeoIdentity({ slug: "spirit-acs", publicDomain: "www.spiritacs.com" })
  const imageUrl = `${resolveTenantOrigin(identity)}/custom-sites/spirit-acs/og-spirit-acs.png`

  const meta = buildTenantPageMetadata({
    identity,
    path: "/",
    title: "Detailing automobile à Lagny-sur-Marne | Spirit ACS",
    description: "Spirit ACS, detailing automobile à Lagny-sur-Marne.",
    siteName: "Spirit ACS",
    imageUrl,
    imageAlt: "Spirit ACS — detailing automobile",
  })

  it("og:url et canonical pointent sur https://www.spiritacs.com (sans ?tenant=)", () => {
    expect(meta.alternates?.canonical).toBe("https://www.spiritacs.com/")
    expect((meta.openGraph as { url?: string }).url).toBe("https://www.spiritacs.com/")
    expect(JSON.stringify(meta)).not.toContain("tenant=spirit-acs")
  })

  it("og:image est une URL absolue HTTPS sur le domaine Spirit", () => {
    const images = (meta.openGraph as { images?: Array<{ url: string; width?: number; height?: number }> }).images
    expect(images?.[0]?.url).toBe("https://www.spiritacs.com/custom-sites/spirit-acs/og-spirit-acs.png")
    expect(images?.[0]).toMatchObject({ width: 1200, height: 630 })
    expect(images?.[0]?.url.startsWith("https://")).toBe(true)
  })

  it("twitter card summary_large_image avec la même image", () => {
    expect((meta.twitter as { card?: string }).card).toBe("summary_large_image")
    const twImages = (meta.twitter as { images?: string[] }).images
    expect(twImages?.[0]).toBe("https://www.spiritacs.com/custom-sites/spirit-acs/og-spirit-acs.png")
  })

  it("aucune référence à une image de Porsche dans les metadata", () => {
    expect(JSON.stringify(meta).toLowerCase()).not.toContain("porsche")
  })
})
