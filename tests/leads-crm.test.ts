import { describe, it, expect } from "vitest"
import { resolveFeature, type LicenseContext, type ResolvedOverride } from "@/lib/licensing/resolver"
import type { LicensePlan } from "@/lib/licensing/types"
import {
  advanceLeadStatus,
  mapCustomRequestStatus,
  nextStatusFromCustomRequest,
  nextStatusFromBooking,
  followUpBucket,
  addDaysYmd,
  zonedStartOfDayUtc,
  isLeadStatus,
  isLeadSource,
  LEAD_STATUS_LABELS,
  LEAD_SOURCE_LABELS,
  type LeadStatus,
} from "@/lib/leads/model"

/**
 * LOT 2 — CRM PROSPECTS (leads).
 *
 * Tests PURS : matrice de licence (resolver central) + helpers de statut,
 * de progression, de mapping source, et de fuseau des relances. Aucune écriture
 * DB, aucun accès réseau (les synchros DB sont couvertes par leur idempotence
 * SQL UNIQUE + revue). Reflète la décision commerciale : `leads_crm` = offre
 * « Ultime » (BUSINESS) et au-dessus.
 */

function ctx(plan: LicensePlan | null, overrides: ResolvedOverride[] = []): LicenseContext {
  return { plan, generation: plan == null ? null : "LIFETIME_V1", overrides }
}

const NOW = new Date("2026-02-15T12:00:00Z")

describe("leads_crm — matrice des offres", () => {
  it("FREE / ESSENTIAL / PRO => refusé (le CRM devient une vraie feature Ultime)", () => {
    expect(resolveFeature(ctx("FREE"), "leads_crm", NOW)).toBe(false)
    expect(resolveFeature(ctx("ESSENTIAL"), "leads_crm", NOW)).toBe(false)
    expect(resolveFeature(ctx("PRO"), "leads_crm", NOW)).toBe(false)
  })

  it("BUSINESS (Ultime) / ENTERPRISE => autorisé", () => {
    expect(resolveFeature(ctx("BUSINESS"), "leads_crm", NOW)).toBe(true)
    expect(resolveFeature(ctx("ENTERPRISE"), "leads_crm", NOW)).toBe(true)
  })

  it("FOUNDER => autorisé (dérivé de sa génération LIFETIME_V1)", () => {
    expect(resolveFeature(ctx("FOUNDER"), "leads_crm", NOW)).toBe(true)
  })

  it("LEGACY (licensePlan = NULL) => comportement historique (autorisé)", () => {
    expect(resolveFeature(ctx(null), "leads_crm", NOW)).toBe(true)
  })

  it("override ENABLED sur PRO => CRM débloqué sans changer de plan", () => {
    const overrides: ResolvedOverride[] = [
      { featureKey: "leads_crm", state: "ENABLED", source: "COMMERCIAL_GESTURE", expiresAt: null },
    ]
    expect(resolveFeature(ctx("PRO", overrides), "leads_crm", NOW)).toBe(true)
  })

  it("override DISABLED sur BUSINESS => CRM verrouillé exceptionnellement", () => {
    const overrides: ResolvedOverride[] = [
      { featureKey: "leads_crm", state: "DISABLED", source: "MANUAL", expiresAt: null },
    ]
    expect(resolveFeature(ctx("BUSINESS", overrides), "leads_crm", NOW)).toBe(false)
  })

  it("plan forgé => fail closed", () => {
    expect(resolveFeature(ctx("HACKER" as unknown as LicensePlan), "leads_crm", NOW)).toBe(false)
  })
})

describe("leads — progression automatique (jamais de régression)", () => {
  it("avance NEW → CONTACTED → APPOINTMENT_BOOKED → CLIENT", () => {
    expect(advanceLeadStatus("NEW", "CONTACTED")).toBe("CONTACTED")
    expect(advanceLeadStatus("CONTACTED", "APPOINTMENT_BOOKED")).toBe("APPOINTMENT_BOOKED")
    expect(advanceLeadStatus("APPOINTMENT_BOOKED", "CLIENT")).toBe("CLIENT")
  })

  it("ne fait JAMAIS régresser CLIENT → CONTACTED automatiquement", () => {
    expect(advanceLeadStatus("CLIENT", "CONTACTED")).toBe("CLIENT")
    expect(advanceLeadStatus("CLIENT", "APPOINTMENT_BOOKED")).toBe("CLIENT")
    expect(advanceLeadStatus("CLIENT", "NEW")).toBe("CLIENT")
  })

  it("n'avance pas en arrière depuis APPOINTMENT_BOOKED vers CONTACTED", () => {
    expect(advanceLeadStatus("APPOINTMENT_BOOKED", "CONTACTED")).toBe("APPOINTMENT_BOOKED")
  })

  it("LOST n'est jamais imposé par une progression automatique", () => {
    expect(advanceLeadStatus("CONTACTED", "LOST")).not.toBe("LOST")
  })
})

describe("leads — mapping des statuts custom_request", () => {
  it("new → NEW", () => {
    expect(mapCustomRequestStatus("new", false)).toBe("NEW")
  })
  it("proposal_sent / accepted → CONTACTED", () => {
    expect(mapCustomRequestStatus("proposal_sent", false)).toBe("CONTACTED")
    expect(mapCustomRequestStatus("accepted", false)).toBe("CONTACTED")
  })
  it("declined → LOST", () => {
    expect(mapCustomRequestStatus("declined", false)).toBe("LOST")
  })
  it("bookingId présent / converted → APPOINTMENT_BOOKED", () => {
    expect(mapCustomRequestStatus("new", true)).toBe("APPOINTMENT_BOOKED")
    expect(mapCustomRequestStatus("converted", true)).toBe("APPOINTMENT_BOOKED")
  })

  it("synchro custom_request ne fait pas régresser un CLIENT existant", () => {
    // Un CLIENT dont une vieille demande repasse proposal_sent reste CLIENT.
    expect(nextStatusFromCustomRequest("CLIENT", "proposal_sent", false)).toBe("CLIENT")
  })
})

describe("leads — mapping des statuts booking (sur lead fiablement lié)", () => {
  it("pending_deposit → ne devient pas CLIENT", () => {
    const s = nextStatusFromBooking("NEW", "pending_deposit")
    expect(s).not.toBe("CLIENT")
  })
  it("confirmed → APPOINTMENT_BOOKED", () => {
    expect(nextStatusFromBooking("NEW", "confirmed")).toBe("APPOINTMENT_BOOKED")
  })
  it("completed → CLIENT", () => {
    expect(nextStatusFromBooking("APPOINTMENT_BOOKED", "completed")).toBe("CLIENT")
  })
  it("cancelled → jamais LOST automatiquement", () => {
    expect(nextStatusFromBooking("APPOINTMENT_BOOKED", "cancelled")).not.toBe("LOST")
  })
  it("cancelled ne fait pas régresser un CLIENT déjà converti", () => {
    expect(nextStatusFromBooking("CLIENT", "cancelled")).toBe("CLIENT")
  })
})

describe("leads — relances (buckets dans le fuseau tenant)", () => {
  it("relance en retard / aujourd'hui / à venir", () => {
    const today = "2026-02-15"
    expect(followUpBucket("2026-02-14", today)).toBe("overdue")
    expect(followUpBucket("2026-02-15", today)).toBe("today")
    expect(followUpBucket("2026-02-16", today)).toBe("upcoming")
    expect(followUpBucket(null, today)).toBe("none")
  })

  it("addDaysYmd calcule la borne du lendemain", () => {
    expect(addDaysYmd("2026-02-15", 1)).toBe("2026-02-16")
    expect(addDaysYmd("2026-02-28", 1)).toBe("2026-03-01")
  })

  it("zonedStartOfDayUtc reflète le fuseau métier (Europe/Paris décalé de UTC)", () => {
    // Minuit à Paris le 15/02 (hiver, UTC+1) = 23:00 UTC la veille.
    const d = zonedStartOfDayUtc("2026-02-15", "Europe/Paris")
    expect(d.toISOString()).toBe("2026-02-14T23:00:00.000Z")
  })
})

describe("leads — garde-fous de type", () => {
  it("isLeadStatus / isLeadSource rejettent les valeurs forgées", () => {
    expect(isLeadStatus("CLIENT")).toBe(true)
    expect(isLeadStatus("HACK")).toBe(false)
    expect(isLeadSource("CUSTOM_REQUEST")).toBe(true)
    expect(isLeadSource("SECRET")).toBe(false)
  })

  it("les libellés FR existent pour chaque statut et source", () => {
    const statuses: LeadStatus[] = ["NEW", "CONTACTED", "APPOINTMENT_BOOKED", "CLIENT", "LOST"]
    for (const s of statuses) expect(LEAD_STATUS_LABELS[s]).toBeTruthy()
    expect(LEAD_SOURCE_LABELS.MANUAL).toBe("Ajout manuel")
    expect(LEAD_SOURCE_LABELS.CUSTOM_REQUEST).toBe("Demande du site")
  })
})
