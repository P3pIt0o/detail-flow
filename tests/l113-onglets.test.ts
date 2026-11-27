import { describe, expect, it } from "vitest"
import { createElement as h } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Tabs } from "@/components/ui/tabs"
import {
  AdminTabsList,
  AdminTabsTrigger,
  TabScroller,
  fadeEdges,
  fadeMask,
  scrollTargetFor,
} from "@/components/admin/admin-tabs"

/**
 * L113 — barres d'onglets de l'admin : jamais de retour à la ligne, défilement horizontal
 * avec fondu sur le bord, onglet actif ramené en vue, cibles de 44 px.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const classOf = (html: string, slot: string) => {
  const m = html.match(new RegExp(`<[^>]*data-slot="${slot}"[^>]*>`))
  expect(m, slot).not.toBeNull()
  return m![0].match(/class="([^"]*)"/)![1].split(/\s+/)
}

describe("rendu du composant commun", () => {
  const html = renderToStaticMarkup(
    h(
      Tabs,
      { defaultValue: "services" },
      h(
        AdminTabsList,
        null,
        h(AdminTabsTrigger, { value: "services" }, "Prestations"),
        h(AdminTabsTrigger, { value: "matrix" }, "Tarifs"),
      ),
    ),
  )

  it("la liste d'onglets ne passe jamais à la ligne", () => {
    const list = classOf(html, "tabs-list")
    expect(list).not.toContain("flex-wrap")
    expect(list).toContain("flex-nowrap")
    expect(list).toContain("w-max")
    expect(list).toContain("min-w-full")
    expect(list).not.toContain("group-data-horizontal/tabs:h-8")
  })

  it("chaque onglet fait au moins 44 px, sans retour à la ligne du libellé, actif en couleur principale", () => {
    const trigger = classOf(html, "tabs-trigger")
    expect(trigger).toContain("min-h-11")
    expect(trigger).toContain("whitespace-nowrap")
    expect(trigger).toContain("shrink-0")
    expect(trigger).toContain("data-active:bg-primary")
    expect(trigger).toContain("data-active:text-primary-foreground")
  })

  it("la liste est dans un conteneur à défilement horizontal", () => {
    const scroller = classOf(html, "tab-scroller")
    expect(scroller).toContain("overflow-x-auto")
    expect(scroller).toContain("overflow-y-hidden")
    expect(html.indexOf('data-slot="tab-scroller"')).toBeLessThan(html.indexOf('data-slot="tabs-list"'))
  })

  it("TabScroller seul enveloppe n'importe quelle barre", () => {
    const out = renderToStaticMarkup(h(TabScroller, null, h("nav", null, "x")))
    expect(out).toContain('data-slot="tab-scroller"')
    expect(out).toContain("<nav>x</nav>")
  })
})

describe("les cinq barres utilisent le composant commun", () => {
  it("Prestations & tarifs : libellés courts, valeurs, titre et sous-titre inchangés", () => {
    const src = read("app/admin/(dashboard)/prestations/page.tsx")
    expect(src).toContain("<AdminTabsList")
    expect(src).not.toContain("flex-wrap")
    expect(src).not.toMatch(/<TabsList|<TabsTrigger/)
    const triggers = [...src.matchAll(/<AdminTabsTrigger value="(\w+)">([^<]+)<\/AdminTabsTrigger>/g)].map((m) => [m[1], m[2]])
    expect(triggers).toEqual([
      ["services", "Prestations"],
      ["matrix", "Tarifs"],
      ["vehicles", "Véhicules"],
      ["options", "Options"],
    ])
    for (const v of ["services", "matrix", "vehicles", "options"]) expect(src).toContain(`<TabsContent value="${v}"`)
    expect(src).toContain('defaultValue="services"')
    expect(src).toContain("Prestations &amp; tarifs</h1>")
    expect(src).toContain("Gérez votre catalogue : prestations, types de véhicules, options et grille tarifaire.")
  })

  it("Offres : mêmes libellés et valeurs, plus de flex-wrap", () => {
    const src = read("components/admin/offres/offers-manager.tsx")
    expect(src).toContain("<AdminTabsList")
    expect(src).not.toMatch(/<TabsList|<TabsTrigger/)
    expect(src).not.toMatch(/TabsList className="flex-wrap"/)
    expect(src).toContain('<AdminTabsTrigger value="offers">Offres</AdminTabsTrigger>')
    expect(src).toContain('<AdminTabsTrigger value="equivalences">Équivalences</AdminTabsTrigger>')
    expect(src).toContain('<AdminTabsTrigger value="upsells">Compléments suggérés</AdminTabsTrigger>')
  })

  it("Paramètres : sous-onglets sur une ligne, toujours pilotés par SettingsTabs", () => {
    const src = read("app/admin/(dashboard)/parametres/page.tsx")
    expect(src).toContain("<SettingsTabs")
    expect(src).toContain("<AdminTabsList")
    expect(src).toContain("<AdminTabsTrigger key={t.value} value={t.value}")
    expect(src).not.toMatch(/<TabsList|<TabsTrigger/)
    expect(src).not.toContain("flex-wrap justify-start")
  })

  it("Prospects : filtres dans TabScroller, cibles de 44 px, mêmes statuts", () => {
    const src = read("components/admin/leads/leads-filters.tsx")
    expect(src).toContain("<TabScroller")
    expect(src).toContain("min-h-11")
    expect(src).not.toContain("min-h-9 shrink-0")
    expect(src).toContain('aria-label="Filtrer par statut"')
    for (const k of ['key: "NEW"', 'key: "CONTACTED"', 'key: "APPOINTMENT_BOOKED"', 'key: "CLIENT"', 'key: "LOST"', 'key: "due"'])
      expect(src).toContain(k)
  })

  it("Analyse : périodes sur une ligne dans TabScroller, cibles de 44 px", () => {
    const src = read("components/admin/analyse/period-selector.tsx")
    expect(src).toContain("<TabScroller")
    expect(src).not.toContain("flex-wrap")
    expect(src).toContain("flex-nowrap")
    expect(src).toContain("min-h-11")
    expect(src).not.toContain("min-h-9")
    expect(src).toContain("aria-current={isActive ? \"page\" : undefined}")
  })
})

describe("calcul du fondu", () => {
  it("tout visible : aucun fondu", () => {
    expect(fadeEdges({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toEqual({ left: false, right: false })
    expect(fadeMask({ left: false, right: false })).toBeUndefined()
  })
  it("au début : fondu à droite seulement", () => {
    expect(fadeEdges({ scrollLeft: 0, scrollWidth: 600, clientWidth: 300 })).toEqual({ left: false, right: true })
  })
  it("au milieu : fondu des deux côtés", () => {
    expect(fadeEdges({ scrollLeft: 150, scrollWidth: 600, clientWidth: 300 })).toEqual({ left: true, right: true })
  })
  it("à la fin (arrondi inclus) : fondu à gauche seulement", () => {
    expect(fadeEdges({ scrollLeft: 299.5, scrollWidth: 600, clientWidth: 300 })).toEqual({ left: true, right: false })
  })
  it("masques CSS correspondants", () => {
    expect(fadeMask({ left: false, right: true })).toMatch(/^linear-gradient\(90deg, #000 calc\(100% - \d+px\), transparent\)$/)
    expect(fadeMask({ left: true, right: false })).toMatch(/^linear-gradient\(90deg, transparent, #000 \d+px\)$/)
    expect(fadeMask({ left: true, right: true })).toContain("transparent, #000")
  })
})

describe("retour en vue de l'onglet actif", () => {
  const view = { scrollLeft: 100, clientWidth: 300 }
  it("onglet caché à gauche : on défile vers la gauche (jamais sous 0)", () => {
    expect(scrollTargetFor(view, { left: 50, width: 80 })).toBe(50 - 24)
    expect(scrollTargetFor(view, { left: 10, width: 80 })).toBe(0)
  })
  it("onglet caché à droite : on défile juste assez pour le montrer", () => {
    expect(scrollTargetFor(view, { left: 380, width: 100 })).toBe(380 + 100 + 24 - 300)
  })
  it("onglet déjà visible : aucun défilement", () => {
    expect(scrollTargetFor(view, { left: 150, width: 100 })).toBeNull()
  })
})
