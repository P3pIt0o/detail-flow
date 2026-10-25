import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { COMMERCIAL_PLANS } from "@/lib/pricing/plans"
import { COMPARE_CATEGORIES, COMPARE_COLUMNS, getPlanUpcomingFeatures } from "@/components/marketing/v4/pricing-data"
import { FeatureCompare, PlanCard } from "@/components/marketing/v4/pricing"

const P11 =
  "Ces fonctionnalités sont en préparation. Elles ne sont pas incluses actuellement dans l&#x27;offre Performance. Leur disponibilité sera annoncée ultérieurement."

const cardHtml = (id: string) => renderToStaticMarkup(createElement(PlanCard, { plan: COMMERCIAL_PLANS.find((p) => p.id === id)! }))
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;")
const liSegments = (html: string) => html.split("<li").slice(1).map((s) => s.slice(0, s.indexOf("</li>")))

describe("L13 — A2 : rendu serveur des cartes", () => {
  for (const plan of COMMERCIAL_PLANS) {
    const html = cardHtml(plan.id)
    const upcoming = [...plan.upcomingFeatures, ...getPlanUpcomingFeatures(plan.id).map((i) => i.label)]

    it(`${plan.name} : aucune fonction future avec une coche`, () => {
      for (const seg of liSegments(html)) {
        if (upcoming.some((label) => seg.includes(esc(label)))) {
          expect(seg, seg).not.toMatch(/lucide-check/)
          expect(seg).toMatch(/lucide-clock/)
        }
      }
    })

    it(`${plan.name} : aucune fonction future sous « Fonctionnalités incluses »`, () => {
      const start = html.indexOf("Fonctionnalités incluses")
      expect(start).toBeGreaterThan(-1)
      const end = html.indexOf("Prochainement", start)
      const included = html.slice(start, end === -1 ? undefined : end)
      for (const label of upcoming) expect(included).not.toContain(esc(label))
    })
  }

  it("Performance : section « Prochainement » + texte P11, aucune note SMS", () => {
    const html = cardHtml("ultime")
    expect(html).toContain("Prochainement")
    expect(html).toContain(P11)
    expect(html).not.toMatch(/SMS crédités/)
    expect(html).not.toMatch(/Fonctionnalités prévues/)
  })

  it("Équipe : section « Prochainement », pas de texte P11", () => {
    const html = cardHtml("entreprise")
    expect(html).toContain("Comptes et agendas par collaborateur")
    expect(html).not.toContain("offre Performance. Leur")
  })
})

describe("L13 — A3 : cellules « Bientôt disponible » du comparateur", () => {
  const html = renderToStaticMarkup(createElement(FeatureCompare))
  const soonCells = COMPARE_CATEGORIES.flatMap((c) => c.rows).flatMap((r) => COMPARE_COLUMNS.filter((col) => r.values[col.id] === "soon"))

  it("chaque cellule « soon » affiche un texte visible et une icône aria-hidden", () => {
    const cells = [...html.matchAll(/<span data-cell="soon"[^>]*>(.*?)<\/span>/g)].map((m) => m[1])
    expect(soonCells.length).toBeGreaterThan(0)
    expect(cells).toHaveLength(soonCells.length)
    for (const cell of cells) {
      expect(cell).toContain("Bientôt disponible")
      expect(cell).toMatch(/<svg[^>]*aria-hidden="true"/)
    }
  })

  it("aucun contrôle désactivé ni coche dans une cellule « soon »", () => {
    expect(html).not.toMatch(/disabled/)
  })

  it("mobile : chaque fonction future de l'offre est listée sous « Prochainement »", () => {
    for (const col of COMPARE_COLUMNS) {
      for (const item of getPlanUpcomingFeatures(col.id)) expect(html).toContain(esc(item.label))
    }
    expect(html).toContain("Prochainement")
  })
})
