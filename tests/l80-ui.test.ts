import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { buildAdminNavGroups, buildMainNav, buildPlusGroups } from "@/lib/admin/nav"

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const FORBIDDEN = /ical|webcal|caldav/i

/** Textes affichés d'un fichier : on retire commentaires, imports et valeurs de props techniques. */
function visibleText(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^import .*$/gm, "")
}

describe("L80 — écran « Mon agenda »", () => {
  const panel = read("components/admin/calendar-sync-panel.tsx")
  const page = read("app/admin/(dashboard)/mon-agenda/page.tsx")

  it("aucun des mots « iCal », « webcal », « CalDAV » dans les textes affichés", () => {
    expect(visibleText(panel)).not.toMatch(FORBIDDEN)
    // la page ne fait que passer les adresses ; ses textes visibles n'en contiennent pas
    expect(visibleText(page).replace(/feedIphoneUrl|iphoneUrl/g, "")).not.toMatch(FORBIDDEN)
  })

  it("deux gros boutons avec les bons liens ; l'adresse brute est sous « Autre agenda »", () => {
    expect(panel).toContain("Ajouter à mon iPhone")
    expect(panel).toContain("Ajouter à Google Agenda")
    expect(panel).toContain("href={props.iphoneUrl}")
    expect(panel).toContain("href={props.googleUrl}")
    const other = panel.indexOf("Autre agenda")
    expect(other).toBeGreaterThan(panel.indexOf("Ajouter à Google Agenda"))
    expect(panel.indexOf("value={props.rawAddress}")).toBeGreaterThan(other)
    expect(panel).toContain("Générer une nouvelle adresse")
  })

  it("choix iPhone / Android, puis 3 étapes pour ce téléphone seulement", () => {
    expect(panel).toContain("Quel téléphone avez-vous ?")
    expect(panel).toMatch(/PHONE_STEPS\[phone\]\.map/)
    expect(panel).toMatch(/\/android\/i\.test\(navigator\.userAgent\)/)
    const steps = panel.match(/iphone: \[([\s\S]*?)\],\n\s+android: \[([\s\S]*?)\],/)
    expect(steps).not.toBeNull()
    for (const group of [steps![1], steps![2]]) expect((group.match(/^\s+"/gm) ?? []).length).toBe(3)
  })

  it("pas de consigne « agenda différent » (supprimée)", () => {
    expect(panel).not.toMatch(/agenda différent|autre agenda que/i)
  })

  it("la page est réservée au propriétaire/admin de la société et n'affiche que l'adresse masquée", () => {
    expect(page).toContain('requireCompanyMember(["OWNER", "ADMIN"])')
    expect(page).toContain("maskExternalUrl(settings.externalUrl)")
    expect(page).not.toMatch(/externalUrl=\{settings\.externalUrl\}/)
  })

  it("accès : bouton en haut du Calendrier + « Mon agenda » dans Plus, pas dans la barre du bas", () => {
    expect(read("components/admin/admin-calendar.tsx")).toMatch(/href="\/admin\/mon-agenda"[\s\S]*Relier à mon téléphone/)
    const opts = { intent: null, customSiteKey: null } as const
    const hrefs = buildAdminNavGroups(opts).flatMap((g) => g.items.map((i) => i.href))
    expect(hrefs).toContain("/admin/mon-agenda")
    expect(buildMainNav().map((i) => i.href)).not.toContain("/admin/mon-agenda")
    expect(buildPlusGroups(opts).flatMap((g) => g.items.map((i) => i.href))).toContain("/admin/mon-agenda")
  })
})
