import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Étape 2B — correctif Lot 1 : garanties STRUCTURELLES du gate `website`.
 *
 * 1. Le downgrade ne supprime AUCUNE donnée : le module de garde n'exécute
 *    aucune mutation DB (pas de db.update / db.delete / db.insert). Réactiver
 *    `website` réaffiche donc le site tel quel (données jamais touchées).
 *
 * 2. /reservation n'est PAS bloquée par le gate `website` : la garde vitrine
 *    n'est appliquée qu'aux 4 pages vitrine, et l'action de réservation
 *    contrôle `online_booking` (son propre entitlement), pas `website`.
 */

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), "utf8")

describe("gate website — aucune suppression de données (downgrade sûr)", () => {
  it("le module de garde n'exécute aucune mutation DB", () => {
    const src = read("lib/licensing/website-guard.ts")
    expect(src).not.toMatch(/db\.(update|delete|insert)/)
  })
})

describe("gate website — /reservation non impactée par website", () => {
  it("les pages vitrine (et elles seules) importent la garde website", () => {
    const vitrine = [
      "app/(site)/page.tsx",
      "app/(site)/prestations/page.tsx",
      "app/(site)/contact/page.tsx",
      "app/(site)/avis/page.tsx",
    ]
    for (const rel of vitrine) {
      expect(read(rel)).toContain("requireWebsiteFeature")
    }
  })

  it("les pages reservation N'importent PAS la garde website", () => {
    const reservation = [
      "app/(site)/reservation/page.tsx",
      "app/(site)/reservation/confirmation/page.tsx",
    ]
    for (const rel of reservation) {
      expect(read(rel)).not.toContain("requireWebsiteFeature")
    }
  })

  it("l'action de réservation contrôle online_booking, pas website", () => {
    const src = read("app/(site)/reservation/actions.ts")
    expect(src).toContain('canUseFeature(tenant.id, "online_booking")')
    expect(src).not.toContain('"website"')
  })
})
