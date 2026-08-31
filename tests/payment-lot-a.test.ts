import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  normalizePaymentMode,
  resolveCheckoutType,
  maxOnlinePayableCents,
  willRequireOnlinePayment,
  STRIPE_MIN_CENTS,
  PAYMENT_MODES,
} from "@/lib/payments/mode"

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8")
}

/* ------------------------------------------------------------------ */
/*  LOT A — normalisation du mode (base & navigateur jamais crus)     */
/* ------------------------------------------------------------------ */

describe("LOT A — normalizePaymentMode", () => {
  it("accepte les quatre modes connus", () => {
    for (const m of PAYMENT_MODES) expect(normalizePaymentMode(m)).toBe(m)
  })
  it("retombe sur 'none' pour toute valeur inconnue/illégale", () => {
    expect(normalizePaymentMode("hack")).toBe("none")
    expect(normalizePaymentMode(null)).toBe("none")
    expect(normalizePaymentMode(undefined)).toBe("none")
    expect(normalizePaymentMode(42)).toBe("none")
  })
})

/* ------------------------------------------------------------------ */
/*  LOT A — type encaissé : mode tenant = autorité, choix = "choice"  */
/* ------------------------------------------------------------------ */

describe("LOT A — resolveCheckoutType (autorité serveur)", () => {
  it("mode 'deposit' force TOUJOURS l'acompte (le choix client est ignoré)", () => {
    expect(resolveCheckoutType("deposit")).toBe("deposit")
    expect(resolveCheckoutType("deposit", "full_payment")).toBe("deposit")
  })
  it("mode 'full' force TOUJOURS l'intégral (le choix client est ignoré)", () => {
    expect(resolveCheckoutType("full")).toBe("full_payment")
    expect(resolveCheckoutType("full", "deposit")).toBe("full_payment")
  })
  it("mode 'choice' honore le choix client (acompte ou intégral)", () => {
    expect(resolveCheckoutType("choice", "deposit")).toBe("deposit")
    expect(resolveCheckoutType("choice", "full_payment")).toBe("full_payment")
  })
  it("mode 'choice' par défaut = intégral (jamais un acompte non demandé)", () => {
    expect(resolveCheckoutType("choice")).toBe("full_payment")
    expect(resolveCheckoutType("choice", null)).toBe("full_payment")
  })
  it("mode 'none' = aucun paiement applicable", () => {
    expect(resolveCheckoutType("none")).toBeNull()
    expect(resolveCheckoutType("none", "full_payment")).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/*  LOT A — montant encaissable en ligne                              */
/* ------------------------------------------------------------------ */

describe("LOT A — maxOnlinePayableCents", () => {
  it("acompte = montant de l'acompte ; intégral/choix = total", () => {
    expect(maxOnlinePayableCents("deposit", 420, 1050)).toBe(420)
    expect(maxOnlinePayableCents("full", 420, 1050)).toBe(1050)
    expect(maxOnlinePayableCents("choice", 420, 1050)).toBe(1050)
    expect(maxOnlinePayableCents("none", 420, 1050)).toBe(0)
  })
})

/* ------------------------------------------------------------------ */
/*  LOT A — décision d'email de création (fin du double email)        */
/* ------------------------------------------------------------------ */

describe("LOT A — willRequireOnlinePayment (dédup email création)", () => {
  const base = { depositCents: 420, totalCents: 1050 }

  it("tenant hors-ligne (paiements non prêts) → PAS de paiement → email de création envoyé", () => {
    expect(willRequireOnlinePayment({ ...base, paymentsReady: false, mode: "full" })).toBe(false)
  })
  it("mode 'none' → PAS de paiement → email de création envoyé", () => {
    expect(willRequireOnlinePayment({ ...base, paymentsReady: true, mode: "none" })).toBe(false)
  })
  it("mode 'full' avec total ≥ minimum Stripe → paiement requis → PAS d'email de création", () => {
    expect(willRequireOnlinePayment({ ...base, paymentsReady: true, mode: "full" })).toBe(true)
  })
  it("mode 'deposit' avec acompte ≥ minimum → paiement requis → PAS d'email de création", () => {
    expect(willRequireOnlinePayment({ ...base, paymentsReady: true, mode: "deposit" })).toBe(true)
  })
  it("mode 'choice' → borné au total → paiement requis", () => {
    expect(willRequireOnlinePayment({ ...base, paymentsReady: true, mode: "choice" })).toBe(true)
  })
  it("montant sous le minimum Stripe → NON encaissable → email de création envoyé (repli)", () => {
    // acompte 0,40 € < 0,50 € : mode acompte → pas de paiement en ligne effectif.
    expect(
      willRequireOnlinePayment({ paymentsReady: true, mode: "deposit", depositCents: 40, totalCents: 40 }),
    ).toBe(false)
    // total 0,49 € < 0,50 € : même en mode intégral, rien d'encaissable.
    expect(
      willRequireOnlinePayment({ paymentsReady: true, mode: "full", depositCents: 0, totalCents: 49 }),
    ).toBe(false)
  })
  it("le seuil est exactement le minimum Stripe (bord inclus)", () => {
    expect(
      willRequireOnlinePayment({ paymentsReady: true, mode: "full", depositCents: 0, totalCents: STRIPE_MIN_CENTS }),
    ).toBe(true)
    expect(
      willRequireOnlinePayment({ paymentsReady: true, mode: "full", depositCents: 0, totalCents: STRIPE_MIN_CENTS - 1 }),
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  LOT A — câblage & garde-fous (structure, sans base réelle)        */
/* ------------------------------------------------------------------ */

describe("LOT A — email de confirmation unique (câblage)", () => {
  const actions = read("app/(site)/reservation/actions.ts")

  it("l'email de création n'est envoyé QUE si aucun paiement en ligne n'est requis", () => {
    expect(actions).toContain("willRequireOnlinePayment")
    expect(actions).toContain("if (!requiresOnlinePayment) {")
    expect(actions).toContain("await sendBookingCreatedEmails(result.id)")
  })

  it("la confirmation post-paiement reste pilotée par le seul webhook signé", () => {
    const webhook = read("app/api/payments/webhook/route.ts")
    expect(webhook).toContain("sendPaymentReceivedEmails(bookingId, companyId)")
    // La page de retour ne déclenche jamais d'email.
    const retour = read("app/(site)/reservation/paiement/[bookingId]/retour/page.tsx")
    expect(retour).not.toContain("sendPaymentReceivedEmails")
  })
})

describe("LOT A — mode 'choice' (câblage + isolation montant serveur)", () => {
  const queries = read("lib/payments/queries.ts")
  const page = read("app/(site)/reservation/paiement/[bookingId]/page.tsx")
  const admin = read("components/admin/settings/payments-settings.tsx")

  it("createBookingCheckout résout le type côté serveur et plafonne l'acompte au total", () => {
    expect(queries).toContain("resolveCheckoutType(cfg.paymentMode, chosenType)")
    expect(queries).toContain("Math.min(booking.depositCents, booking.totalCents)")
    // Montant TOUJOURS relu depuis la réservation (jamais fourni par le client).
    expect(queries).toContain("booking.totalCents")
  })

  it("le checkout reste borné au tenant (isolation anti-IDOR)", () => {
    expect(queries).toContain("eq(bookings.companyId, companyId)")
  })

  it("la page de paiement propose le choix acompte/intégral en mode 'choice'", () => {
    expect(page).toContain("PaymentModeChoice")
    expect(page).toContain('cfg.paymentMode === "choice"')
  })

  it("l'admin peut sélectionner le mode 'choice'", () => {
    expect(admin).toContain('setMode("choice")')
    expect(admin).toContain("Laisser le client choisir")
  })
})

describe("LOT A — rétrocompatibilité / aucune migration", () => {
  it("paymentMode reste une colonne text (défaut 'none') : 'choice' sans migration", () => {
    const schema = read("lib/db/schema.ts")
    expect(schema).toContain('paymentMode: text("paymentMode").notNull().default("none")')
  })
  it("config & queries normalisent le mode issu de la base (valeurs héritées sûres)", () => {
    expect(read("lib/payments/config.ts")).toContain("normalizePaymentMode(row?.paymentMode)")
    expect(read("lib/payments/queries.ts")).toContain("normalizePaymentMode(c.paymentMode)")
  })
})
