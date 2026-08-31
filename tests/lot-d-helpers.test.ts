import { describe, it, expect } from "vitest"
import {
  buildMapsDirectionsUrl,
  isAddressUsable,
  ADDRESS_INCOMPLETE_LABEL,
} from "@/lib/notifications/maps"
import {
  validateGoogleReviewLink,
  buildReviewLinkFromPlaceId,
  resolveEffectiveReviewLink,
} from "@/lib/notifications/review-link"
import {
  reminderSendAt,
  reviewSendAt,
  isReminderDue,
  shouldScheduleReminder,
  normalizeReminderOffset,
  normalizeReviewOffset,
  formatInTenantTimeZone,
} from "@/lib/notifications/schedule"

describe("Maps directions helper (#2)", () => {
  it("encode l'adresse complète et impose le bon format sans point de départ", () => {
    const url = buildMapsDirectionsUrl("12 rue des Fleurs, 75001 Paris")
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=12%20rue%20des%20Fleurs%2C%2075001%20Paris&travelmode=driving",
    )
    expect(url).not.toContain("origin=")
  })

  it("n'inclut que le paramètre destination (aucune donnée personnelle injectée)", () => {
    const url = new URL(buildMapsDirectionsUrl("5 av. Victor Hugo, 69002 Lyon")!)
    const keys = [...url.searchParams.keys()].sort()
    // Seuls api, destination et travelmode sont présents : jamais de nom,
    // téléphone, email ou origin.
    expect(keys).toEqual(["api", "destination", "travelmode"])
    expect(url.searchParams.get("destination")).toBe("5 av. Victor Hugo, 69002 Lyon")
  })

  it("gère les accents", () => {
    const url = buildMapsDirectionsUrl("3 allée Général Leclerc, 33000 Bordeaux")!
    expect(url).toContain(encodeURIComponent("3 allée Général Leclerc, 33000 Bordeaux"))
  })

  it("refuse une adresse manquante ou incomplète (pas de lien trompeur)", () => {
    expect(buildMapsDirectionsUrl(null)).toBeNull()
    expect(buildMapsDirectionsUrl("")).toBeNull()
    expect(buildMapsDirectionsUrl("   ")).toBeNull()
    expect(buildMapsDirectionsUrl("abc")).toBeNull() // trop court
    expect(buildMapsDirectionsUrl("Paris")).toBeNull() // ni chiffre ni virgule
    expect(isAddressUsable("Domicile")).toBe(false)
    expect(ADDRESS_INCOMPLETE_LABEL).toBe("Adresse à compléter")
  })

  it("accepte une adresse avec repère (chiffre ou virgule)", () => {
    expect(isAddressUsable("Chez Paul, centre-ville")).toBe(true)
    expect(isAddressUsable("10 Grand Rue")).toBe(true)
  })
})

describe("Google review link validation (#3)", () => {
  it("accepte les domaines Google officiels en HTTPS", () => {
    for (const ok of [
      "https://search.google.com/local/writereview?placeid=ChIJabc",
      "https://g.page/mon-garage/review",
      "https://maps.app.goo.gl/xyz",
      "https://www.google.com/maps/place/?q=place_id:ChIJabc",
    ]) {
      expect(validateGoogleReviewLink(ok).ok).toBe(true)
    }
  })

  it("refuse javascript:, http, et domaines trompeurs", () => {
    for (const bad of [
      "javascript:alert(1)",
      "http://google.com/review", // pas https
      "https://google.evil.com/review", // sous-domaine trompeur inversé
      "https://mygoogle.com/review",
      "https://notgoogle.com",
      "https://phishing.example.com",
      "",
      "   ",
      "pas une url",
    ]) {
      expect(validateGoogleReviewLink(bad).ok).toBe(false)
    }
  })

  it("construit un lien depuis un Place ID existant, jamais inventé", () => {
    expect(buildReviewLinkFromPlaceId("ChIJ123")).toBe(
      "https://search.google.com/local/writereview?placeid=ChIJ123",
    )
    expect(buildReviewLinkFromPlaceId(null)).toBeNull()
    expect(buildReviewLinkFromPlaceId("  ")).toBeNull()
  })

  it("priorise le Place ID puis le lien manuel valide, sinon null", () => {
    expect(resolveEffectiveReviewLink({ placeId: "ChIJ9", manualLink: "https://g.page/x" })).toContain(
      "placeid=ChIJ9",
    )
    expect(resolveEffectiveReviewLink({ placeId: null, manualLink: "https://g.page/x/review" })).toBe(
      "https://g.page/x/review",
    )
    expect(resolveEffectiveReviewLink({ placeId: null, manualLink: "http://evil.com" })).toBeNull()
    expect(resolveEffectiveReviewLink({ placeId: null, manualLink: null })).toBeNull()
  })
})

describe("Scheduling & timezone (#4)", () => {
  const start = new Date("2026-03-15T10:00:00.000Z")

  it("calcule l'instant d'envoi avant le RDV (offset en heures)", () => {
    expect(reminderSendAt(start, 2).toISOString()).toBe("2026-03-15T08:00:00.000Z")
    expect(reminderSendAt(start, 24).toISOString()).toBe("2026-03-14T10:00:00.000Z")
  })

  it("calcule l'instant de demande d'avis après réalisation", () => {
    const done = new Date("2026-03-15T12:30:00.000Z")
    expect(reviewSendAt(done, 2).toISOString()).toBe("2026-03-15T14:30:00.000Z")
  })

  it("n'est dû qu'entre l'instant d'envoi et le début du RDV", () => {
    const sendAt = reminderSendAt(start, 2) // 08:00Z
    expect(isReminderDue(new Date("2026-03-15T07:59:00Z"), sendAt, start)).toBe(false) // trop tôt
    expect(isReminderDue(new Date("2026-03-15T08:30:00Z"), sendAt, start)).toBe(true) // ok
    expect(isReminderDue(new Date("2026-03-15T10:01:00Z"), sendAt, start)).toBe(false) // après début
  })

  it("réservation tardive : ne programme pas de rappel si l'instant d'envoi est passé", () => {
    const now = new Date("2026-03-15T09:30:00Z") // 30 min avant un RDV à 10:00
    expect(shouldScheduleReminder(now, start, 2)).toBe(false) // sendAt 08:00 déjà passé
    expect(shouldScheduleReminder(now, start, 24)).toBe(false)
    const early = new Date("2026-03-14T00:00:00Z")
    expect(shouldScheduleReminder(early, start, 2)).toBe(true)
  })

  it("ne programme pas pour un RDV déjà commencé", () => {
    expect(shouldScheduleReminder(new Date("2026-03-15T10:30:00Z"), start, 2)).toBe(false)
  })

  it("normalise les offsets vers les valeurs autorisées (défaut 2h)", () => {
    expect(normalizeReminderOffset(1)).toBe(1)
    expect(normalizeReminderOffset(24)).toBe(24)
    expect(normalizeReminderOffset(3)).toBe(2)
    expect(normalizeReminderOffset("abc")).toBe(2)
    expect(normalizeReviewOffset(24)).toBe(24)
    expect(normalizeReviewOffset(5)).toBe(2)
  })

  it("affiche l'heure dans le fuseau du tenant, en gérant l'heure d'été", () => {
    // 15 mars 10:00 UTC => 11:00 à Paris (heure d'hiver, UTC+1)
    const winter = formatInTenantTimeZone(start, "Europe/Paris", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    expect(winter).toBe("11:00")
    // 15 juillet 10:00 UTC => 12:00 à Paris (heure d'été, UTC+2)
    const summer = formatInTenantTimeZone(new Date("2026-07-15T10:00:00Z"), "Europe/Paris", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    expect(summer).toBe("12:00")
  })
})
