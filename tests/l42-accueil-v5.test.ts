import { createElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { COMMERCIAL_PLANS, INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT, PRICING_COPY } from "@/lib/pricing/plans"
import { COMMISSION_RULES } from "@/lib/billing/commercial-rules"
import { formatBpsPercent } from "@/lib/payments/config"
import { formatPrice } from "@/lib/format"
import { PLAN_MATRIX } from "@/lib/licensing/registry"
import { SMS_MONTHLY_INCLUDED_BY_PLAN } from "@/lib/sms/config"
import { TRUSTPILOT } from "@/components/marketing/v4/trustpilot"
import { CLIENT_LOGOS, FAQ_V5, REVIEWS } from "@/components/marketing/v5/data"
import { SiteHeader } from "@/components/marketing/v5/site-header"
import { SiteFooter } from "@/components/marketing/v5/site-footer"
import { Hero } from "@/components/marketing/v5/hero"
import { ClientLogos } from "@/components/marketing/v5/client-logos"
import { Features } from "@/components/marketing/v5/features"
import { Reviews } from "@/components/marketing/v5/reviews"
import { Pricing } from "@/components/marketing/v5/pricing"
import { Faq } from "@/components/marketing/v5/faq"
import { FinalCta } from "@/components/marketing/v5/final-cta"

vi.mock("next/font/google", () => ({ Schibsted_Grotesk: () => ({ className: "font-schibsted" }) }))

const html = (c: () => ReactElement) => renderToStaticMarkup(createElement(c))
/** Échappement React des textes (apostrophes, esperluettes). */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;")
/** Texte brut d'un rendu (balises retirées, entités courantes décodées). */
const text = (h: string) =>
  h
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
/** href du premier lien dont le texte vaut `label`. */
const hrefOf = (h: string, label: string) => {
  for (const m of h.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    if (text(m[2]).trim() === label) return m[1].match(/href="([^"]*)"/)?.[1]?.replace(/&amp;/g, "&")
  }
  return undefined
}
const plan = (id: string) => COMMERCIAL_PLANS.find((p) => p.id === id)!

const header = html(SiteHeader)
const footer = html(SiteFooter)
const hero = html(Hero)
const features = html(Features)
const reviews = html(Reviews)
const pricing = html(Pricing)
const faq = html(Faq)
const finalCta = html(FinalCta)
const logos = html(ClientLogos)

async function loadMarketing(maintenance: boolean) {
  vi.resetModules()
  vi.doMock("@/lib/marketing/maintenance", () => ({ MARKETING_MAINTENANCE_ENABLED: maintenance }))
  const layout = await import("@/app/marketing/layout")
  const page = await import("@/app/marketing/page")
  return { layout, page }
}

afterEach(() => {
  vi.doUnmock("@/lib/marketing/maintenance")
})

describe("L42 — C2 liens", () => {
  it.each([
    [header, "DetailFlow", "/"],
    [header, "Fonctionnalités", "/#fonctions"],
    [header, "Tarifs", "/#tarifs"],
    [header, "Questions", "/#faq"],
    [header, "Connexion", "/admin/login"],
    [header, "Essayer gratuitement", "/demarrer"],
    [hero, "Créer mon espace gratuitement", "/demarrer"],
    [hero, "Voir le logiciel", "/#fonctions"],
    [hero, `${TRUSTPILOT.ratingLabel} sur Trustpilot`, TRUSTPILOT.reviewUrl],
    [features, "Toutes les fonctionnalités →", "/#fonctions"],
    [reviews, "Lire tous les avis sur Trustpilot", TRUSTPILOT.reviewUrl],
    [pricing, "Créer mon espace", "/demarrer"],
    [pricing, "Essayer 30 jours gratuitement", "/demarrer?plan=PRO"],
    [finalCta, "Créer mon espace gratuitement", "/demarrer"],
    [footer, "Nous le créons pour vous", "mailto:contact@detailflow.fr"],
    [footer, "Mentions légales", "/mentions-legales"],
    [footer, "CGV", "/conditions"],
    [footer, "Confidentialité", "/confidentialite"],
    [footer, "Cookies", "/cookies"],
    [footer, "Contact", "mailto:contact@detailflow.fr"],
  ])("%#  « %s » → %s", (h, label, href) => {
    expect(hrefOf(h, label)).toBe(href)
  })

  it("« Essayer 30 jours » = cta.href d'Indépendant", () => {
    expect(hrefOf(pricing, plan("pro").cta.label)).toBe(plan("pro").cta.href)
  })

  it("aucun lien Blog ni Comparer", () => {
    for (const h of [header, hero, features, reviews, pricing, faq, finalCta, footer]) {
      expect(text(h)).not.toMatch(/Blog|Comparer/)
    }
  })

  it("aucune offre coming_soon ne pointe vers /demarrer", () => {
    const perf = plan("ultime")
    expect(perf.availability).toBe("coming_soon")
    const start = pricing.indexOf(`>${perf.name}<`)
    expect(start).toBeGreaterThan(-1)
    expect(pricing.slice(start)).not.toContain("/demarrer")
    expect(pricing.slice(start)).toContain(PRICING_COPY.comingSoonLabel)
  })

  it("liens Trustpilot externes ouverts en sécurité", () => {
    for (const h of [hero, reviews]) {
      const tag = h.match(new RegExp(`<a[^>]*href="${TRUSTPILOT.reviewUrl}"[^>]*>`))?.[0]
      expect(tag).toContain('rel="noopener noreferrer"')
    }
  })
})

describe("L42 — C3 montants et citations", () => {
  const dir = path.join(process.cwd(), "components/marketing/v5")
  const sources = readdirSync(dir).map((f) => [f, readFileSync(path.join(dir, f), "utf8")] as const)

  it.each(sources)("%s : aucun montant ni pourcentage en dur", (_f, src) => {
    expect(src).not.toMatch(/\d+([,.]\d+)?\s?€/)
    expect(src).not.toMatch(/\d+\s?%/)
  })

  it("titre tarifs : commission Indépendant et prix lus dans les sources", () => {
    expect(text(pricing)).toContain(
      `Gratuit pour commencer. ${formatBpsPercent(COMMISSION_RULES.PRO.feeBps)} % de commission dès ${plan("pro").price}.`,
    )
  })

  it("cartes : nom, prix, période, commission, plafond et quotas", () => {
    const t = text(pricing)
    for (const id of ["starter", "pro", "ultime"]) {
      expect(t).toContain(plan(id).name)
      expect(t).toContain(plan(id).price)
    }
    // La maquette affiche « / mois » sur les trois cartes : doit rester aligné sur les offres payantes.
    expect(plan("pro").period).toBe("/ mois")
    expect(plan("ultime").period).toBe("/ mois")
    expect(t).toContain(
      `${PLAN_MATRIX.FREE.limits.maxQuotesPerMonth} devis et ${PLAN_MATRIX.FREE.limits.maxInvoicesPerMonth} factures par mois`,
    )
    expect(t).toContain(
      `Commission de ${formatBpsPercent(COMMISSION_RULES.FREE.feeBps)} % sur les paiements en ligne, plafonnée à ${formatPrice(COMMISSION_RULES.FREE.monthlyFeeCapCents)} par mois.`,
    )
    expect(t).toContain(`${SMS_MONTHLY_INCLUDED_BY_PLAN.PRO} SMS par mois`)
    expect(t).toContain(`${INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT}.`)
    expect(t).toContain(`${formatBpsPercent(COMMISSION_RULES.BUSINESS.feeBps)} % de commission.`)
    expect(t).toContain("le plus choisi")
    expect(t).not.toContain(plan("entreprise").price)
  })

  it("valeurs attendues aujourd'hui (garde-fou de la promesse commerciale)", () => {
    const t = text(pricing).replace(/ | /g, " ")
    expect(t).toContain("Gratuit pour commencer. 0 % de commission dès 19,90 €.")
    expect(t).toContain("10 devis et 10 factures par mois. Commission de 2 % sur les paiements en ligne, plafonnée à 19,90 € par mois.")
    expect(t).toContain("20 SMS par mois")
  })

  it("phrase Équipe affichée seulement si coming_soon", () => {
    expect(plan("entreprise").availability).toBe("coming_soon")
    expect(text(pricing)).toContain("Plusieurs collaborateurs ? L'offre Équipe arrive bientôt.")
  })

  it("FAQ : commission recalculée", () => {
    // « Rien sur les offres payantes » est écrit en dur : il n'est vrai que si Pro et Business sont à 0.
    expect(COMMISSION_RULES.PRO.feeBps).toBe(0)
    expect(COMMISSION_RULES.BUSINESS.feeBps).toBe(0)
    expect(FAQ_V5[3].a).toBe(
      `Rien sur les offres payantes. Sur l'offre gratuite Essentiel : ${formatBpsPercent(COMMISSION_RULES.FREE.feeBps)} % des paiements en ligne, plafonnés à ${formatPrice(COMMISSION_RULES.FREE.monthlyFeeCapCents)} par mois. Les frais de Stripe s'appliquent à part.`,
    )
    expect(faq.match(/<details/g)).toHaveLength(4)
    for (const item of FAQ_V5) expect(text(faq)).toContain(item.q)
  })

  it("3 citations rendues mot pour mot (maquette)", () => {
    const maquette = readFileSync(path.join(process.cwd(), "docs/lots/L42.apercu.html"), "utf8")
    const quotes = [...maquette.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g)].map((m) => m[1])
    expect(quotes).toHaveLength(3)
    expect(REVIEWS.map((r) => r.quote)).toEqual(quotes)
    for (const q of quotes) expect(text(reviews)).toContain(q)
    expect(text(reviews)).toContain("JustClean, detailing en Vendée · avis Trustpilot, août 2026")
    expect(text(reviews)).toContain("AutoCare, detailing à Hyères · avis Trustpilot, août 2026")
    expect(text(reviews)).toContain("Dh_auto_clean, nettoyage automobile, Belgique · avis Trustpilot, août 2026")
  })
})

describe("L42 — images", () => {
  const imgs = (h: string) => [...h.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])

  it("toutes les images : alt non vide, width et height", () => {
    for (const tag of [...imgs(hero), ...imgs(features), ...imgs(logos)]) {
      expect(tag).toMatch(/alt="[^"]+"/)
      expect(tag).toMatch(/width="\d+"/)
      expect(tag).toMatch(/height="\d+"/)
    }
  })

  it("hero prioritaire, captures suivantes en lazy", () => {
    const [h] = imgs(hero)
    expect(h).not.toContain('loading="lazy"')
    expect(h).toMatch(/fetchPriority="high"|fetchpriority="high"/)
    expect(imgs(features)).toHaveLength(3)
    for (const tag of imgs(features)) expect(tag).toContain('loading="lazy"')
  })

  it("CLIENT_LOGOS : 4 entrées, alt de la décision 6, fichiers présents", () => {
    expect(CLIENT_LOGOS.map((l) => l.alt)).toEqual(["Rhine Shine Detailling", "KY Detailing", "AutoCare", "JustClean"])
    for (const l of CLIENT_LOGOS) {
      expect(l.src.startsWith("/marketing/v5/logos/")).toBe(true)
      expect(existsSync(path.join(process.cwd(), "public", l.src))).toBe(true)
      expect(logos).toContain(`alt="${esc(l.alt)}"`)
    }
  })
})

describe("L42 — C4 page et layout", () => {
  it("hors maintenance : un seul h1, JSON-LD valide avec FAQPage = FAQ_V5", async () => {
    const { page } = await loadMarketing(false)
    const h = renderToStaticMarkup(createElement(page.default))
    expect(h.match(/<h1\b/g)).toHaveLength(1)
    const raw = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
    expect(raw).toBeTruthy()
    const ld = JSON.parse(raw!)
    expect(ld["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual([
      "Organization",
      "WebSite",
      "SoftwareApplication",
      "FAQPage",
    ])
    const faqPage = ld["@graph"][3]
    expect(faqPage.mainEntity).toHaveLength(4)
    expect(faqPage.mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => [q.name, q.acceptedAnswer.text])).toEqual(
      FAQ_V5.map((i) => [i.q, i.a]),
    )
  })

  it("hors maintenance : en-tête et pied v5 rendus, themeColor #f7f5f0", async () => {
    const { layout } = await loadMarketing(false)
    const h = renderToStaticMarkup(createElement(layout.default, { children: createElement("p", null, "contenu") }))
    expect(h).toContain('aria-label="Navigation principale"')
    expect(h).toContain("Besoin d&#x27;un site vitrine ?")
    expect(h).toContain("bg-[#f7f5f0]")
    expect(layout.generateViewport()).toMatchObject({ themeColor: "#f7f5f0" })
  })

  it("en maintenance : ni en-tête ni pied, viewport inchangé", async () => {
    const { layout } = await loadMarketing(true)
    const h = renderToStaticMarkup(createElement(layout.default, { children: createElement("p", null, "contenu") }))
    expect(h).not.toContain("Navigation principale")
    expect(h).not.toContain("site vitrine")
    expect(layout.generateViewport()).toEqual({})
  })
})
