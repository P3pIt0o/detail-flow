import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { middleware } from "@/middleware"
import {
  CUSTOM_SITE_TENANT_SLUGS,
  TENANT_CANONICAL_HOST,
  publicPagePathRedirect,
} from "@/lib/tenant-shared"
import { customSiteMetaRegistry } from "@/lib/custom-sites/meta"
import { CLEANYZER_TENANT_SLUG } from "@/components/custom-sites/cleanyzer/tokens"
import { SPIRIT_TENANT_SLUG } from "@/components/custom-sites/spirit-acs/seo-content"
import { ROZAN_TENANT_SLUG } from "@/components/custom-sites/rozan/content"

/**
 * L30 — `/p/<slug>` d'un site standard redirige vers l'adresse canonique
 * `?tenant=<slug>` (les liens publics lisent `?tenant=` dans l'URL du
 * navigateur : sans lui, « Réserver » tombait en 404). Embed, sites sur mesure
 * et domaines personnalisés gardent la réécriture historique.
 */

const redirect = (url: string) => {
  const u = new URL(url, "https://www.detailflow.fr")
  return publicPagePathRedirect(u.pathname, u.searchParams)
}

describe("publicPagePathRedirect — site standard", () => {
  it.each([
    ["/p/garage-a", "/?tenant=garage-a"],
    ["/p/garage-a/", "/?tenant=garage-a"],
    ["/p/garage-a/reservation", "/reservation?tenant=garage-a"],
    ["/p/garage-a/prestations", "/prestations?tenant=garage-a"],
    ["/p/garage-a/formules", "/formules?tenant=garage-a"],
    ["/p/garage-a/contact", "/contact?tenant=garage-a"],
    ["/p/garage-a/avis", "/avis?tenant=garage-a"],
  ])("%s → %s", (from, to) => {
    expect(redirect(from)).toBe(to)
  })

  it("conserve tous les paramètres existants", () => {
    const to = redirect("/p/garage-a/reservation?view=both&utm_source=fb&utm_campaign=x&preview=3&gclid=abc")!
    const u = new URL(to, "https://x")
    expect(u.pathname).toBe("/reservation")
    expect(Object.fromEntries(u.searchParams)).toEqual({
      view: "both",
      utm_source: "fb",
      utm_campaign: "x",
      preview: "3",
      gclid: "abc",
      tenant: "garage-a",
    })
  })

  it("R4 : un ?tenant= du navigateur est écrasé par le slug du chemin", () => {
    expect(redirect("/p/garage-a/reservation?tenant=garage-b")).toBe("/reservation?tenant=garage-a")
  })

  it("chemins invalides → pas de redirection", () => {
    expect(redirect("/p")).toBeNull()
    expect(redirect("/p/")).toBeNull()
    expect(redirect("/p/ADMIN espace")).toBeNull()
    expect(redirect("/reservation?tenant=garage-a")).toBeNull()
  })

  it("anti-boucle : aucune cible n'est redirigée à nouveau, ni ne commence par /p/", () => {
    for (const from of ["/p/garage-a", "/p/garage-a/reservation?utm_source=x", "/p/garage-a/formules?view=both"]) {
      const to = redirect(from)!
      expect(to.startsWith("/p/")).toBe(false)
      expect(redirect(to)).toBeNull()
    }
    expect(redirect("/p/garage-a/p/garage-b")).toBeNull()
  })
})

describe("publicPagePathRedirect — comportement inchangé (réécriture)", () => {
  it("embed=1", () => {
    expect(redirect("/p/garage-a/reservation?embed=1")).toBeNull()
    expect(redirect("/p/garage-a/formules?embed=1&view=both")).toBeNull()
  })

  it.each(Object.entries(CUSTOM_SITE_TENANT_SLUGS))("site sur mesure %s (/p/%s)", (_key, slug) => {
    expect(redirect(`/p/${slug}`)).toBeNull()
    expect(redirect(`/p/${slug}/reservation`)).toBeNull()
    expect(redirect(`/p/${slug}/prestations?utm_source=x`)).toBeNull()
  })

  it.each(Object.keys(TENANT_CANONICAL_HOST))("domaine personnalisé %s", (slug) => {
    expect(redirect(`/p/${slug}`)).toBeNull()
    expect(redirect(`/p/${slug}/reservation`)).toBeNull()
  })

  it("la table couvre exactement les sites sur mesure enregistrés, avec leurs vrais slugs", () => {
    expect(Object.keys(CUSTOM_SITE_TENANT_SLUGS).sort()).toEqual(Object.keys(customSiteMetaRegistry).sort())
    expect(CUSTOM_SITE_TENANT_SLUGS).toEqual({
      "spirit-acs": SPIRIT_TENANT_SLUG,
      rozan: ROZAN_TENANT_SLUG,
      cleanyzer: CLEANYZER_TENANT_SLUG,
    })
  })
})

describe("middleware", () => {
  const run = (url: string) => middleware(new NextRequest(new URL(url, "https://www.detailflow.fr")))

  it("/p/<slug>/reservation → 307 vers ?tenant=, paramètres conservés", () => {
    const res = run("/p/garage-a/reservation?utm_source=x")
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://www.detailflow.fr/reservation?utm_source=x&tenant=garage-a")
  })

  it.each([
    "/p/garage-a/reservation?embed=1",
    "/p/cleanyzer",
    "/p/spirit-acs",
    "/p/rozancleaningservice/reservation",
  ])("%s → réécriture, pas de redirection", (url) => {
    const res = run(url)
    expect(res.headers.get("location")).toBeNull()
    expect(res.headers.get("x-middleware-rewrite")).toBeTruthy()
  })

  it("/reservation?tenant=garage-a → aucune redirection", () => {
    expect(run("/reservation?tenant=garage-a").headers.get("location")).toBeNull()
  })
})

describe("bouton « Ouvrir » de l'aperçu", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

  it("ouvre l'adresse canonique (humanSiteUrl), l'iframe garde /p/<slug>", () => {
    const page = read("app/admin/page-publique/page.tsx")
    expect(page).toMatch(/openUrl=\{humanSiteUrl\(tenant\.slug, process\.env\.NEXT_PUBLIC_ROOT_DOMAIN\)\}/)
    const preview = read("components/public-page/live-preview.tsx")
    expect(preview).toMatch(/href=\{openUrl\}/)
    expect(preview).not.toMatch(/href=\{previewPath\}/)
    expect(preview).toMatch(/\$\{previewPath\}\?preview=/)
  })
})
