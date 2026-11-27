import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/**
 * Refonte du dashboard Spirit ACS. Ces tests protègent les invariants métier et
 * de sécurité sans rendre le composant serveur : ils vérifient la SOURCE (même
 * style que les tests de licensing existants). Aucune donnée réelle requise.
 */
describe("dashboard Spirit ACS — réorganisation gatée", () => {
  // L96 : l'écran Spirit a été déplacé tel quel dans son propre fichier.
  const entry = read("app/admin/(dashboard)/page.tsx")
  const page = read("app/admin/(dashboard)/spirit-dashboard-home.tsx")

  it("la disposition spécifique est strictement gatée par customSiteKey", () => {
    expect(entry).toContain('company.customSiteKey === "spirit-acs"')
    expect(entry).toMatch(/if \(isSpirit\) \{\s*return <SpiritDashboardHome company=\{company\}/)
    expect(entry.split("<SpiritDashboardHome").length - 1).toBe(1)
  })

  it('"À traiter" réutilise UNIQUEMENT des statuts réels (new + accepted)', () => {
    // Règle d'action = new (à étudier) ou accepted (à organiser).
    expect(page).toContain('new Set(["new", "accepted"])')
    // proposal_sent = attente client, pas une action de Corentin.
    expect(page).toContain('r.status === "proposal_sent"')
    // Aucun statut inventé hors du cycle de vie du module Demandes.
    expect(page).not.toMatch(/status\s*===\s*["'](todo|pending|urgent|open)["']/)
  })

  it("les demandes proviennent du module existant, scopé tenant côté serveur", () => {
    expect(entry).toContain("requireCompanyMember()")
    expect(page).toContain("listCustomRequests()")
    expect(page).toContain("const companyId = company.id")
  })

  it("le détail d'une demande réutilise la route admin protégée existante", () => {
    expect(page).toContain("/admin/demandes/${r.id}")
    // Jamais d'URL publique de demande exposée depuis le dashboard.
    expect(page).not.toContain("/demande/${")
  })

  it("Spirit ne pointe pas le planning vers Réservations (menu masqué)", () => {
    // Le bloc Spirit envoie vers le calendrier existant.
    expect(page).toContain('href("/admin/calendrier")')
    expect(page).not.toContain('href("/admin/reservations")')
  })

  it("les autres tenants gardent des liens vers les réservations", () => {
    expect(read("lib/admin/today.ts")).toContain('"/admin/reservations"')
  })
})

describe("compteur de photos — isolation tenant", () => {
  it("countAttachmentsByRequest filtre par companyId (anti-fuite inter-tenant)", () => {
    const src = read("lib/quote-photos/server.ts")
    expect(src).toContain("export async function countAttachmentsByRequest")
    expect(src).toMatch(/countAttachmentsByRequest[\s\S]*eq\(quoteRequestAttachments\.companyId, companyId\)/)
  })
})
