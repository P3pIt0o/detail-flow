import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { webNavItem, buildAdminNav } from "@/lib/admin/nav"
import {
  buildEmbedScriptSnippet,
  buildEmbedIframeSnippet,
  embedIframeSrc,
  embedScriptSrc,
} from "@/lib/embed/snippet"

/**
 * MODULE DE RÉSERVATION INTÉGRABLE (parcours booking_only).
 *
 * Le professionnel a DÉJÀ son site. DetailFlow ne crée PAS de site vitrine : il
 * fournit un lien + un code d'intégration qui ouvre le MÊME moteur de
 * réservation dans le site du pro. Ces tests verrouillent :
 *  - la navigation (« Ma réservation » pour booking_only, historique préservé) ;
 *  - les snippets d'intégration (slug injecté serveur, une seule route moteur) ;
 *  - l'isolation multi-tenant (slug = seul paramètre, jamais d'autre tenant) ;
 *  - le mode embarqué de la page moteur (chrome masqué + auto-resize) ;
 *  - l'absence de vitrine générée dans « Ma réservation ».
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const root = "detailflow.fr"

describe("A — navigation selon le parcours", () => {
  it("booking_only → « Ma réservation » vers /admin/ma-reservation (jamais l'éditeur de vitrine)", () => {
    const item = webNavItem("booking_only")
    expect(item.href).toBe("/admin/ma-reservation")
    expect(item.label).toBe("Ma réservation")
  })

  it("public_page → « Mon site » (éditeur de vitrine), inchangé", () => {
    expect(webNavItem("public_page")).toMatchObject({ href: "/admin/page-publique", label: "Mon site" })
  })

  it("null / custom_website → « Page publique » historique (aucune régression)", () => {
    expect(webNavItem(null)).toMatchObject({ href: "/admin/page-publique", label: "Page publique" })
    expect(webNavItem("custom_website")).toMatchObject({ href: "/admin/page-publique", label: "Page publique" })
  })

  it("le menu booking_only contient l'entrée réservation et tous les modules métier", () => {
    const nav = buildAdminNav({ intent: "booking_only", customSiteKey: null })
    const hrefs = nav.map((n) => n.href)
    expect(hrefs).toContain("/admin/ma-reservation")
    expect(hrefs).not.toContain("/admin/page-publique")
    // Modules métier communs, jamais retirés :
    for (const h of ["/admin/calendrier", "/admin/reservations", "/admin/clients", "/admin/factures"]) {
      expect(hrefs).toContain(h)
    }
  })
})

describe("B — snippets d'intégration (slug injecté serveur, un seul moteur)", () => {
  it("le snippet recommandé porte le slug via data-detailflow-slug et charge embed.js", () => {
    const s = buildEmbedScriptSnippet("mon-garage", root)
    expect(s).toContain('data-detailflow-reservation data-detailflow-slug="mon-garage"')
    expect(s).toContain(`src="${embedScriptSrc(root)}"`)
    expect(embedScriptSrc(root)).toBe("https://www.detailflow.fr/embed.js")
    // Aucun identifiant technique éditable par le pro autre que le slug.
    expect(s).not.toMatch(/tenantId|companyId|apiKey/i)
  })

  it("le snippet iframe pointe vers la route canonique /p/<slug>/reservation?embed=1", () => {
    const s = buildEmbedIframeSnippet("mon-garage", root)
    expect(s).toContain(embedIframeSrc("mon-garage", root))
    expect(embedIframeSrc("mon-garage", root)).toBe(
      "https://www.detailflow.fr/p/mon-garage/reservation?embed=1",
    )
    expect(s).toContain("<iframe")
  })

  it("deux tenants → deux snippets distincts (aucune fuite cross-tenant)", () => {
    const a = buildEmbedIframeSnippet("garage-a", root)
    const b = buildEmbedIframeSnippet("garage-b", root)
    expect(a).toContain("/p/garage-a/reservation?embed=1")
    expect(b).toContain("/p/garage-b/reservation?embed=1")
    expect(a).not.toBe(b)
  })

  it("l'origine embed est absolue même sans domaine racine (repli marketing)", () => {
    expect(embedIframeSrc("x")).toBe("https://www.detailflow.fr/p/x/reservation?embed=1")
  })
})

describe("C — mode embarqué du moteur (chrome masqué + auto-resize)", () => {
  const page = read("app/(site)/reservation/page.tsx")
  const layout = read("app/(site)/layout.tsx")
  const css = read("app/globals.css")
  const loader = read("public/embed.js")

  it("la page moteur détecte ?embed=1 et monte la synchro d'iframe", () => {
    expect(page).toContain("embed === \"1\"")
    expect(page).toContain("EmbedFrameSync")
    expect(page).toContain("df-embed")
  })

  it("le chrome du site hôte est masqué en mode embarqué", () => {
    expect(layout).toContain("data-df-chrome")
    expect(css).toContain("html.df-embed [data-df-chrome]")
    expect(css).toContain("display: none")
  })

  it("le loader crée UNE iframe vers /p/<slug>/reservation?embed=1 et vérifie l'origine des messages", () => {
    expect(loader).toContain('"/p/" + encodeURIComponent(slug) + "/reservation?embed=1"')
    expect(loader).toContain("event.origin !== ORIGIN")
    expect(loader).toContain("detailflow:height")
  })
})

describe("D — « Ma réservation » : module intégrable, jamais une vitrine générée", () => {
  const page = read("app/admin/(dashboard)/ma-reservation/page.tsx")
  const card = read("components/admin/reservation-embed-card.tsx")

  it("le slug tenant est injecté CÔTÉ SERVEUR dans le lien et les snippets", () => {
    expect(page).toContain("const slug = tenant.slug")
    expect(page).toContain("publicReservationUrl(slug, rootDomain)")
    expect(page).toContain("buildEmbedScriptSnippet(slug, rootDomain)")
    expect(page).toContain("buildEmbedIframeSnippet(slug, rootDomain)")
  })

  it("la carte propose le partage du lien ET le code d'intégration (script + repli iframe)", () => {
    expect(card).toContain("Partager mon lien")
    expect(card).toContain("Intégrer le module à mon site")
    expect(card).toContain("scriptSnippet")
    expect(card).toContain("iframeSnippet")
  })

  it("« Ma réservation » ne construit AUCUN site vitrine (pas d'éditeur de page publique)", () => {
    expect(page).not.toContain("ConfigEditor")
    expect(page).not.toContain("page-publique")
    // Elle renvoie vers les réglages du moteur, pas vers un configurateur de vitrine.
    expect(page).toContain("/admin/parametres")
  })
})
