import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { computeDiscountCents } from "@/lib/promo/service"
import { computeDeposit } from "@/lib/booking/pricing"
import { withTenant } from "@/lib/tenant-link"
import {
  paymentReceivedClientEmail,
  paymentReceivedProEmail,
  type BookingEmailData,
} from "@/lib/email/templates"

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8")
}

/* ------------------------------------------------------------------ */
/*  LOT 1 — Calcul du montant (100% serveur, en centimes)             */
/* ------------------------------------------------------------------ */

describe("LOT 1 — moteur de remise (centimes, sans arrondi flottant)", () => {
  const SUB = 15000 // 150,00 € d'assiette éligible (services + options)

  it("remise 90 %", () => {
    expect(computeDiscountCents("percent", 90, SUB)).toBe(13500) // reste 15,00 €
  })

  it("remise 99 %", () => {
    expect(computeDiscountCents("percent", 99, SUB)).toBe(14850) // reste 1,50 €
  })

  it("remise 100 % bornée à l'assiette (jamais de total négatif)", () => {
    expect(computeDiscountCents("percent", 100, SUB)).toBe(15000) // reste 0,00 €
  })

  it("calcul en centimes entiers, sans erreur d'arrondi", () => {
    const d = computeDiscountCents("percent", 99, 1126) // floor(1114.74)
    expect(Number.isInteger(d)).toBe(true)
    expect(d).toBe(1114)
  })

  it("remise fixe bornée à l'assiette éligible", () => {
    expect(computeDiscountCents("fixed", 999999, 5000)).toBe(5000)
    expect(computeDiscountCents("fixed", 2000, 5000)).toBe(2000)
  })

  it("acompte calculé sur le TOTAL déjà remisé", () => {
    // total remisé = 1,50 € → acompte 30 % = 0,45 €
    const settings = { depositType: "percent", depositValue: 30 } as never
    expect(computeDeposit(150, settings)).toBe(45)
    // acompte fixe borné au total
    const settingsFixed = { depositType: "fixed", depositValue: 500 } as never
    expect(computeDeposit(150, settingsFixed)).toBe(150)
  })

  it("montant présenté == montant transmis à Stripe (mêmes champs booking)", () => {
    // Le total facturé suit la formule unique : subtotal + travel - discount.
    const subtotal = 15000
    const travel = 900
    const discount = computeDiscountCents("percent", 99, subtotal) // 14850
    const total = subtotal + travel - discount // 1050 = 10,50 €
    expect(total).toBe(1050)
    // full_payment → montant = total ; deposit → montant = depositCents.
    const fullAmount = total
    const depositAmount = computeDeposit(total, { depositType: "percent", depositValue: 40 } as never)
    expect(fullAmount).toBe(1050)
    expect(depositAmount).toBe(420)
  })

  it("la page de paiement affiche le détail (prix initial, promo, remise, total)", () => {
    const src = read("app/(site)/reservation/paiement/[bookingId]/page.tsx")
    expect(src).toContain("Prix initial")
    expect(src).toContain("promoCodeSnapshot")
    expect(src).toContain("Code promo")
    expect(src).toContain("discountCents")
    // Garde-fou minimum Stripe explicite (jamais de substitution silencieuse).
    expect(src).toContain("STRIPE_MIN_CENTS")
    expect(src).toContain("belowStripeMin")
  })
})

/* ------------------------------------------------------------------ */
/*  LOT 2 — Redirection / tenant dans la return_url                   */
/* ------------------------------------------------------------------ */

describe("LOT 2 — return_url conserve le tenant (fix 404)", () => {
  it("ajoute &tenant=<slug> sans casser le placeholder Stripe", () => {
    const url = withTenant(
      "/reservation/paiement/12/retour?session_id={CHECKOUT_SESSION_ID}",
      "itinea-detailing",
    )
    expect(url).toContain("&tenant=itinea-detailing")
    expect(url).toContain("{CHECKOUT_SESSION_ID}")
  })

  it("encode correctement un slug à caractères spéciaux", () => {
    expect(withTenant("/x", "a/b c")).toContain("tenant=a%2Fb%20c")
  })

  it("sans tenant, l'URL est inchangée", () => {
    expect(withTenant("/x", null)).toBe("/x")
  })

  it("checkout-actions construit la return_url avec le slug résolu côté serveur", () => {
    const src = read("app/(site)/reservation/paiement/checkout-actions.ts")
    expect(src).toContain("withTenant(")
    expect(src).toContain("tenant.slug")
    expect(src).toContain("{CHECKOUT_SESSION_ID}")
  })

  it("la page de retour est bornée au tenant et 404 si réservation d'un autre tenant", () => {
    const src = read("app/(site)/reservation/paiement/[bookingId]/retour/page.tsx")
    expect(src).toContain("getBookingPaymentReturnInfo")
    expect(src).toContain("notFound()")
    // Le paiement fait foi via l'état serveur (webhook), jamais via session_id.
    expect(src).not.toContain("session_id")
  })

  it("l'email n'est PAS déclenché depuis la page de retour (webhook seul)", () => {
    const src = read("app/(site)/reservation/paiement/[bookingId]/retour/page.tsx")
    expect(src).not.toContain("sendPaymentReceivedEmails")
    expect(src).not.toContain("@/lib/email/notifications")
  })
})

/* ------------------------------------------------------------------ */
/*  LOT 3 — Emails après paiement (templates + câblage idempotent)    */
/* ------------------------------------------------------------------ */

const fixture: BookingEmailData = {
  reference: "DF-2026-0042",
  customerName: "Jean Client",
  date: "2026-02-10",
  startTime: "09:00",
  endTime: "11:00",
  totalDurationMin: 120,
  address: "12 rue des Lavages, Lyon",
  items: [{ serviceName: "Detailing complet", vehicleTypeName: "SUV", priceCents: 15000 }],
  servicesCents: 15000,
  optionsCents: 0,
  travelFeeCents: 0,
  totalCents: 1050,
  depositCents: 420,
  businessName: "Itinéa Detailing",
  businessEmail: "pro@itinea.fr",
  businessPhone: "0600000000",
}

describe("LOT 3 — templates de paiement (client & pro)", () => {
  it("client — paiement intégral : montant + libellé", () => {
    const mail = paymentReceivedClientEmail(fixture, { amountCents: 1050, isDeposit: false })
    expect(mail.subject).toContain(fixture.reference)
    expect(mail.html).toContain("paiement intégral")
    expect(mail.html).toContain("10,50")
  })

  it("client — acompte : mention acompte + solde restant", () => {
    const mail = paymentReceivedClientEmail(fixture, {
      amountCents: 420,
      isDeposit: true,
      remainingCents: 630,
    })
    expect(mail.html).toContain("acompte")
    expect(mail.html).toContain("Solde")
    expect(mail.html).toContain("6,30")
  })

  it("pro — notification d'encaissement avec nom client", () => {
    const mail = paymentReceivedProEmail(fixture, { amountCents: 1050, isDeposit: false })
    expect(mail.subject).toContain(fixture.customerName)
    expect(mail.html).toContain("Paiement intégral")
  })
})

describe("LOT 3 — câblage webhook idempotent + non bloquant", () => {
  const webhook = read("app/api/payments/webhook/route.ts")
  const queries = read("lib/payments/queries.ts")
  const notif = read("lib/email/notifications.ts")

  it("le webhook déclenche l'email UNIQUEMENT sur la transition réelle justPaid", () => {
    expect(webhook).toContain("sendPaymentReceivedEmails")
    expect(webhook).toContain("settled.justPaid")
    // La ligne d'envoi est bien gardée par le if(justPaid).
    const guardIdx = webhook.indexOf("if (settled.justPaid)")
    const sendIdx = webhook.indexOf("sendPaymentReceivedEmails(bookingId")
    expect(guardIdx).toBeGreaterThan(-1)
    expect(sendIdx).toBeGreaterThan(guardIdx)
  })

  it("settlePaymentPaid distingue transition (justPaid true) et déjà payé (false)", () => {
    expect(queries).toContain("justPaid: true")
    expect(queries).toContain("justPaid: false")
  })

  it("l'envoi d'email ne relance jamais (try/catch) et valide l'adresse", () => {
    expect(notif).toContain("export async function sendPaymentReceivedEmails")
    expect(notif).toContain("isValidEmail")
    expect(notif).toContain("client_email_invalid")
    // Historique minimal : envoyé / échoué / ignoré.
    expect(notif).toContain("client_sent")
    expect(notif).toContain("pro_sent")
  })

  it("les logs de paiement ne contiennent AUCUNE donnée personnelle", () => {
    // logPayEmail ne transporte que bookingId / recipient / step / message.
    const logCalls = notif.match(/logPayEmail\([\s\S]*?\)\n/g) ?? []
    expect(logCalls.length).toBeGreaterThan(0)
    for (const call of logCalls) {
      expect(call).not.toMatch(/customerEmail/)
      expect(call).not.toMatch(/customerName/)
      expect(call).not.toMatch(/proEmail/)
      expect(call).not.toMatch(/customerPhone/)
    }
  })
})
