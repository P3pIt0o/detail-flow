import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  classifyMatch,
  daysSince,
  dedupeVehicles,
  normalizeEmail,
  normalizePhone,
  sumCollectedNetCents,
  sumReservedCents,
  vehicleLabel,
} from "@/lib/admin/client-crm"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

describe("Normalisation des coordonnées", () => {
  it("email : minuscule, trim, null si vide", () => {
    expect(normalizeEmail("  Jean.Dupont@Example.COM ")).toBe("jean.dupont@example.com")
    expect(normalizeEmail("")).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })

  it("téléphone : chiffres uniquement, null si vide", () => {
    expect(normalizePhone("06 12 34 56 78")).toBe("0612345678")
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("33612345678")
    expect(normalizePhone("   ")).toBeNull()
  })
})

describe("Rapprochement client (email prioritaire, repli téléphone)", () => {
  const anchor = { email: "jean@a.fr", phone: "0611111111" }

  it("rapproche par email normalisé", () => {
    expect(classifyMatch(anchor, { email: "JEAN@A.FR", phone: "0000000000" })).toBe("match")
  })

  it("repli par téléphone quand l'ancre n'a pas d'email", () => {
    const noEmailAnchor = { email: null, phone: "0611111111" }
    expect(classifyMatch(noEmailAnchor, { email: "autre@a.fr", phone: "06 11 11 11 11" })).toBe("match")
  })

  it("téléphone identique mais email contradictoire => à vérifier (jamais fusionné)", () => {
    expect(classifyMatch(anchor, { email: "autre@b.fr", phone: "0611111111" })).toBe("review")
  })

  it("aucun rapprochement fiable => none", () => {
    expect(classifyMatch(anchor, { email: "x@x.fr", phone: "0999999999" })).toBe("none")
  })
})

describe("Montant réservé (exclut annulées + démo)", () => {
  it("additionne uniquement les réservations non annulées et hors démo", () => {
    const total = sumReservedCents([
      { status: "completed", isDemoData: false, totalCents: 10000 },
      { status: "confirmed", isDemoData: false, totalCents: 5000 },
      { status: "cancelled", isDemoData: false, totalCents: 4000 },
      { status: "confirmed", isDemoData: true, totalCents: 3000 },
    ])
    expect(total).toBe(15000)
  })
})

describe("Encaissé net (paiements encaissés − remboursements, sans double comptage)", () => {
  it("ne compte que les statuts encaissés et déduit les remboursements", () => {
    const net = sumCollectedNetCents([
      { status: "paid", grossAmountCents: 10000, refundedAmountCents: 0 },
      { status: "partially_refunded", grossAmountCents: 8000, refundedAmountCents: 2000 },
      { status: "pending", grossAmountCents: 5000, refundedAmountCents: 0 },
      { status: "failed", grossAmountCents: 7000, refundedAmountCents: 0 },
    ])
    expect(net).toBe(10000 + (8000 - 2000))
  })
})

describe("Déduplication d'affichage des véhicules", () => {
  it("fusionne par immatriculation et garde la date la plus récente", () => {
    const out = dedupeVehicles([
      { type: "Berline", brand: "Peugeot", model: "308", plate: "AA-123-BB", lastDate: "2026-01-01" },
      { type: null, brand: "Peugeot", model: "308", plate: "aa123bb", lastDate: "2026-05-10" },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].lastDate).toBe("2026-05-10")
    expect(vehicleLabel(out[0])).toBe("Peugeot 308")
  })

  it("fusionne par marque/modèle/type quand aucune plaque", () => {
    const out = dedupeVehicles([
      { type: "SUV", brand: "Audi", model: "Q5", plate: null, lastDate: "2025-01-01" },
      { type: "SUV", brand: "Audi", model: "Q5", plate: null, lastDate: "2025-02-01" },
      { type: "Citadine", brand: "Renault", model: "Clio", plate: null, lastDate: "2025-03-01" },
    ])
    expect(out).toHaveLength(2)
  })
})

describe("daysSince", () => {
  it("calcule le nombre de jours écoulés", () => {
    const now = new Date("2026-03-11T12:00:00Z")
    expect(daysSince("2026-03-01", now)).toBe(10)
    expect(daysSince(null, now)).toBeNull()
  })
})

describe("Isolation & hygiène du module CRM", () => {
  const files = [
    "lib/admin/client-crm.ts",
    "lib/admin/client-profile.ts",
    "components/admin/client-profile-view.tsx",
    "components/admin/clients-table.tsx",
    "app/admin/(dashboard)/clients/[id]/page.tsx",
    "app/admin/(dashboard)/clients/reservation/[bookingId]/page.tsx",
  ]

  it("ne contient aucune condition spécifique à un tenant (jamais customSiteKey)", () => {
    for (const f of files) {
      expect(read(f).includes("customSiteKey")).toBe(false)
    }
  })

  it("ne place jamais l'email ou le téléphone client dans une URL de navigation", () => {
    const table = read("components/admin/clients-table.tsx")
    // Ancrage par réservation représentative (id), jamais par coordonnées.
    expect(table.includes("/admin/clients/reservation/")).toBe(true)
    expect(/clients\/\$\{[^}]*(email|phone)/i.test(table)).toBe(false)
    // La route virtuelle est paramétrée par bookingId (id numérique).
    const routeParam = read("app/admin/(dashboard)/clients/reservation/[bookingId]/page.tsx")
    expect(routeParam.includes("getClientProfileByBookingId")).toBe(true)
  })
})
