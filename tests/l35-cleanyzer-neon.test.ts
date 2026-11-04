import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/**
 * L35 — Cleanyzer : haut de page néon, Présentation (vidéo de Tom au clic), Produits & fournisseurs,
 * visite 3D au clic, pilule de contact, SEO. Rendu serveur réel ; seules les polices next/font et la
 * navigation sont simulées.
 */

vi.mock("next/font/google", () => ({
  Fraunces: () => ({ className: "f", variable: "--font-clz-display" }),
  Inter: () => ({ className: "i", variable: "--font-clz-sans" }),
}))
vi.mock("next/navigation", () => ({ usePathname: () => "/p/cleanyzer" }))

import { CleanyzerHero, heroVideoQuality, heroVideoSources } from "@/components/custom-sites/cleanyzer/hero"
import { ClzPresentation } from "@/components/custom-sites/cleanyzer/presentation"
import { ClzFournisseurs } from "@/components/custom-sites/cleanyzer/fournisseurs"
import { Visit3DLazy, createPendingVisit } from "@/components/custom-sites/cleanyzer/visit-3d-lazy"
import { ClzContactPill, clzWhatsappNumber } from "@/components/custom-sites/cleanyzer/contact-pill"
import { CleanyzerShell } from "@/components/custom-sites/cleanyzer/site-shell"
import { BRAND } from "@/components/custom-sites/cleanyzer/content"
import { CLZ_HOME_META } from "@/components/custom-sites/cleanyzer/seo-content"
import { CLZ_BOOKING_HREF, CLZ_DEMANDE_HREF } from "@/components/custom-sites/cleanyzer/tokens"
import { CLZ_SITE_NAV_ITEMS } from "@/components/custom-sites/cleanyzer/nav"

const ROOT = process.cwd()
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8")
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/&amp;/g, "&").replace(/&#x27;/g, "'")
const hrefs = (h: string) => [...h.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
const publicFile = (src: string) => existsSync(path.join(ROOT, "public", src))

describe("haut de page", () => {
  const h = html(createElement(CleanyzerHero))

  it("un seul H1, au texte exact ; « CLEANYZER » et le slogan", () => {
    const h1 = [...h.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""))
    expect(h1).toEqual(["Nettoyage auto & detailing à domicile, à Annecy et alentours"])
    expect(h).toContain(">CLEANYZER<")
    expect(h).toContain("La propreté à l'état pur")
  })

  it("deux vidéos muettes en lecture en ligne, SANS source au rendu serveur ; poster LCP prioritaire", () => {
    const videos = h.match(/<video[^>]*>/g) ?? []
    expect(videos).toHaveLength(2)
    for (const v of videos) {
      expect(v).toMatch(/muted/)
      expect(v).toMatch(/playsinline|playsInline/i)
      expect(v).not.toMatch(/src="/)
    }
    expect(h).toMatch(/<img[^>]*fetchpriority="high"[^>]*src="\/custom-sites\/cleanyzer\/neon\/hero-arrivee-poster\.webp"|<img[^>]*src="\/custom-sites\/cleanyzer\/neon\/hero-arrivee-poster\.webp"[^>]*fetchpriority="high"/i)
  })

  it("720p jusqu'à 760 px, 1080p au-delà ; mouvement réduit → aucune vidéo", () => {
    expect(heroVideoQuality(390)).toBe("720")
    expect(heroVideoQuality(760)).toBe("720")
    expect(heroVideoQuality(761)).toBe("1080")
    expect(heroVideoQuality(1366)).toBe("1080")
    expect(heroVideoSources(1366, false)).toEqual({
      arrivee: "/custom-sites/cleanyzer/neon/hero-arrivee-1080.mp4",
      boucle: "/custom-sites/cleanyzer/neon/hero-boucle-1080.mp4",
    })
    expect(heroVideoSources(390, false)?.boucle).toBe("/custom-sites/cleanyzer/neon/hero-boucle-720.mp4")
    expect(heroVideoSources(1366, true)).toBeNull()
    for (const q of ["720", "1080"]) {
      for (const k of ["arrivee", "boucle"]) expect(publicFile(`/custom-sites/cleanyzer/neon/hero-${k}-${q}.mp4`)).toBe(true)
    }
  })

  it("boutons : Réserver → BookingV2, Voir les tarifs → section des prix", () => {
    expect(h).toMatch(new RegExp(`href="${CLZ_BOOKING_HREF}"[^>]*>[^<]*Réserver mon nettoyage`))
    expect(h).toMatch(/href="[^"]*#tarifs"[^>]*>[^<]*Voir les tarifs/)
  })

  it("pastille « 5,0 · 92 avis Google » vers le lien direct, nouvel onglet ; plus d'ancienne ligne de note", () => {
    expect(BRAND.googleReviewCount).toBe(92)
    expect(BRAND.googleReviewsUrl).toBe("https://maps.app.goo.gl/QeQ4NW2RQVX3xBNx8")
    expect(h).toMatch(/<a[^>]*href="https:\/\/maps\.app\.goo\.gl\/QeQ4NW2RQVX3xBNx8"[^>]*target="_blank"/)
    expect(h).toMatch(/5,0<\/b> · 92 avis Google/)
    expect(h).not.toMatch(/\/5 — /)
    expect(h).toMatch(/Nettoyage auto[\s\S]*Detailing[\s\S]*Matelas[\s\S]*Canapés[\s\S]*Tapis & moquettes/)
  })
})

describe("Présentation", () => {
  const h = html(createElement(ClzPresentation))

  it("textes de la maquette, note conservée, boutons vers tarifs et réservation", () => {
    expect(h).toContain("Cleanyzer — Annecy & alentours")
    expect(h).toContain("la différence.")
    expect(h).toContain("Nettoyage automobile à domicile à Annecy. Intérieur, extérieur & detailing.")
    expect(h).toMatch(/5,0\/5<\/b> — 92 avis Google/)
    expect(hrefs(h)).toContain(CLZ_BOOKING_HREF)
    expect(hrefs(h).some((x) => x.endsWith("#tarifs"))).toBe(true)
  })

  it("vidéo de Tom : bouton de lecture, aucune source vidéo chargée avant le clic", () => {
    expect(h).toContain("Découvrir Cleanyzer en vidéo")
    expect(h).not.toMatch(/\.mp4/)
    expect(h).not.toMatch(/<video/)
  })
})

describe("Produits & fournisseurs", () => {
  const h = html(createElement(ClzFournisseurs))

  it("libellé, H2, texte et 3 preuves exactement comme la maquette", () => {
    expect(h).toContain("Nos fournisseurs")
    expect(h.replace(/<[^>]+>/g, "")).toContain("Des produits de detailing professionnels pour votre voiture, à Annecy.")
    expect(h).toContain(
      "Pour chaque nettoyage auto à domicile à Annecy et alentours, Cleanyzer travaille avec des gammes professionnelles testées en laboratoire, dont des marques 100 % françaises. Les mêmes exigences, du lavage extérieur au shampoing des sièges.",
    )
    for (const t of [
      "Gammes professionnelles",
      "Des produits de pro, pas de grande surface.",
      "Testées en laboratoire",
      "Des formules contrôlées, conformes aux normes européennes.",
      "Dont des marques 100 % françaises",
      "Choisies par Tom pour leurs résultats.",
    ])
      expect(h).toContain(t)
  })

  it("3 photos avec texte alternatif, fichiers présents", () => {
    const imgs = [...h.matchAll(/<img[^>]*>/g)].map((m) => m[0]).filter((i) => !/logos\//.test(i))
    expect(imgs).toHaveLength(3)
    for (const i of imgs) {
      expect(i).toMatch(/alt="[^"]+"/)
      expect(publicFile(/src="([^"]+)"/.exec(i)![1])).toBe(true)
    }
  })

  it("logos : OryShine et Koch-Chemie cliquables (nouvel onglet), Fraber sans lien, Alchimy en texte, copie aria-hidden", () => {
    expect(h).toMatch(/<a[^>]*href="https:\/\/www\.oryshine\.fr\/"[^>]*target="_blank"/)
    expect(h).toMatch(/<a[^>]*href="https:\/\/www\.koch-chemie\.com\/"[^>]*target="_blank"/)
    expect(hrefs(h).filter((x) => /fraber/i.test(x))).toEqual([])
    expect(h).toContain(">Alchimy<")
    expect(h).toMatch(/aria-hidden="true"[^>]*>[\s\S]*oryshine/)
    for (const l of ["oryshine", "kochchemie", "fraber"]) expect(publicFile(`/custom-sites/cleanyzer/neon/logos/${l}.webp`)).toBe(true)
  })
})

describe("Visite 3D au clic", () => {
  it("rendu initial : carte + « Explorer en 3D », aucun canvas", () => {
    const h = html(createElement(Visit3DLazy))
    expect(h).toContain("Explorer en 3D")
    expect(h).not.toMatch(/<canvas/)
  })

  it("lien du film avant le clic : la zone demandée est mémorisée puis rejouée une seule fois après chargement", () => {
    const pending = createPendingVisit()
    expect(pending.take()).toBeNull()
    pending.remember("rims")
    pending.remember("seats") // dernier lien cliqué
    expect(pending.take()).toBe("seats")
    expect(pending.take()).toBeNull()
    const lazy = read("components/custom-sites/cleanyzer/visit-3d-lazy.tsx")
    // Rejouée avec l'origine du parcours déjà enregistrée, une fois la 3D montée.
    expect(lazy).toMatch(/goVisit\(\s*zone,\s*journey\.origin\s*\)/)
  })

  it("le module 3D n'est importé que dynamiquement", () => {
    const lazy = read("components/custom-sites/cleanyzer/visit-3d-lazy.tsx")
    expect(lazy).toMatch(/import\(\s*["']\.\/visit-3d["']\s*\)/)
    expect(lazy).not.toMatch(/from\s+["']\.\/visit-3d["']/)
    const home = read("components/custom-sites/cleanyzer/home-page.tsx")
    expect(home).not.toMatch(/from\s+["']\.\/visit-3d["']/)
  })
})

describe("pilule de contact", () => {
  it("numéro WhatsApp international sans + depuis le numéro du tenant", () => {
    expect(clzWhatsappNumber("0769768571")).toBe("33769768571")
    expect(clzWhatsappNumber("+33769768571")).toBe("33769768571")
    expect(clzWhatsappNumber("0033769768571")).toBe("33769768571")
    expect(clzWhatsappNumber("33769768571")).toBe("33769768571")
    expect(clzWhatsappNumber(null)).toBeNull()
  })

  it("avec contact : Réserver · Appeler · WhatsApp", () => {
    const h = html(createElement(ClzContactPill, { phoneRaw: "0769768571" }))
    expect(hrefs(h)).toEqual([CLZ_BOOKING_HREF, "tel:0769768571", "https://wa.me/33769768571"])
  })

  it("sans contact (aperçu) : Réserver seul ; aucun numéro en dur dans le composant", () => {
    const h = html(createElement(ClzContactPill, { phoneRaw: null }))
    expect(hrefs(h)).toEqual([CLZ_BOOKING_HREF])
    expect(read("components/custom-sites/cleanyzer/contact-pill.tsx")).not.toMatch(/769768571|07 69/)
  })

  it("remplace l'ancienne barre fixe mobile ; le devis textile reste dans le menu", () => {
    const h = html(createElement(CleanyzerShell, { navItems: CLZ_SITE_NAV_ITEMS, immersive: true, contact: null, children: null }))
    expect(h).not.toContain("Devis textile")
    expect(hrefs(h)).toContain(CLZ_DEMANDE_HREF)
    expect(h).toContain('aria-label="Contact rapide"')
  })
})

describe("accueil", () => {
  const home = read("components/custom-sites/cleanyzer/home-page.tsx")
  const body = home.slice(home.indexOf("<CleanyzerHero"))
  const order = [...body.matchAll(/<(\w+)\b[^>]*\/>/g)].map((m) => m[1])

  it("ordre des sections", () => {
    expect(order.slice(0, order.indexOf("ClzReveal"))).toEqual([
      "CleanyzerHero",
      "ClzPresentation",
      "AvantApresSection",
      "PrestationsPreview",
      "ClzFournisseurs",
      "Visit3DLazy",
      "UniversSection",
      "PrestationsFilm",
      "RealisationsTom",
      "ServiceADomicile",
      "ZoneSection",
      "AvisSection",
      "TemoignagesSection",
      "FaqSection",
      "FinalCta",
    ])
    expect(home).not.toMatch(/<AProposSection/)
  })

  it("la section des prix porte l'ancre « tarifs » ; UniversSection garde le devis textile", () => {
    const sections = read("components/custom-sites/cleanyzer/home-sections.tsx")
    const prev = sections.slice(sections.indexOf("export function PrestationsPreview"), sections.indexOf("export function ServiceADomicile"))
    expect(prev).toMatch(/<section id="tarifs"/)
    const univ = sections.slice(sections.indexOf("export function UniversSection"), sections.indexOf("export function PrestationsPreview"))
    expect(univ).toContain("href: CLZ_DEMANDE_HREF")
  })
})

describe("SEO", () => {
  it("titre et description de l'accueil conformes à la fiche", () => {
    expect(CLZ_HOME_META.title).toBe("Nettoyage auto à domicile à Annecy | Cleanyzer")
    expect(CLZ_HOME_META.description).toBe(
      "Nettoyage intérieur et extérieur de votre voiture à domicile, à Annecy et jusqu'à 20 km. Produits professionnels, noté 5/5 sur Google. Réservez en ligne.",
    )
  })
})
