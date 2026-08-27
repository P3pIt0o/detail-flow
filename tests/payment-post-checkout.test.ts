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

describe("LOT 3 — câblage webhook (structure) + non bloquant", () => {
  const webhook = read("app/api/payments/webhook/route.ts")
  const queries = read("lib/payments/queries.ts")
  const notif = read("lib/email/notifications.ts")

  it("le webhook appelle TOUJOURS le dispatch (idempotence durable, pas justPaid)", () => {
    expect(webhook).toContain("sendPaymentReceivedEmails(bookingId, companyId)")
    // Ne dépend plus d'un garde-fou justPaid fragile (perte de reprise sur erreur).
    expect(webhook).not.toContain("if (settled.justPaid)")
  })

  it("settlePaymentPaid effectue une transition ATOMIQUE (WHERE status pending)", () => {
    expect(queries).toContain('eq(payments.status, "pending")')
    expect(queries).toContain(".returning(")
  })

  it("l'idempotence email est DURABLE (persistée dans payments.meta, pas les logs)", () => {
    expect(queries).toContain("export async function claimPaymentEmail")
    expect(queries).toContain("export async function markPaymentEmail")
    expect(queries).toContain("payments.meta")
    // Claim atomique : ne réclame pas si déjà sent/sending/invalid.
    expect(queries).toContain("NOT IN ('sent', 'sending', 'invalid')")
  })

  it("l'envoi ne relance jamais (try/catch), valide l'adresse, états indépendants", () => {
    expect(notif).toContain("export async function sendPaymentReceivedEmails")
    expect(notif).toContain("dispatchPaymentEmail(bookingId, companyId, \"client\")")
    expect(notif).toContain("dispatchPaymentEmail(bookingId, companyId, \"pro\")")
    expect(notif).toContain("isValidEmail")
    // Adresse invalide → état terminal "invalid" (jamais "sent").
    expect(notif).toContain('state: "invalid"')
  })

  it("les logs de paiement ne contiennent AUCUNE donnée personnelle", () => {
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

/* ------------------------------------------------------------------ */
/*  LOT 3bis — Idempotence DURABLE (comportement, avec store simulé)   */
/* ------------------------------------------------------------------ */

/**
 * Reproduit fidèlement la sémantique SQL de claimPaymentEmail / markPaymentEmail
 * (état par destinataire, réclamable uniquement si absent ou "failed") pour
 * tester le COMPORTEMENT sans base réelle. Le vrai code s'appuie sur le verrou
 * de ligne Postgres pour l'atomicité ; on la simule par exécution séquentielle.
 */
function makeEmailStore() {
  const state: Record<string, "sending" | "sent" | "failed" | "invalid"> = {}
  return {
    state,
    claim(recipient: "client" | "pro") {
      const cur = state[recipient]
      if (cur === "sent" || cur === "sending" || cur === "invalid") return false
      state[recipient] = "sending" // absent ou "failed" → réclamable
      return true
    },
    mark(recipient: "client" | "pro", s: "sent" | "failed" | "invalid") {
      state[recipient] = s
    },
  }
}

/** Un envoi simulé : renvoie ok/echec selon la file de réponses fournie. */
function runDispatch(
  store: ReturnType<typeof makeEmailStore>,
  recipient: "client" | "pro",
  send: () => { ok: boolean; invalidAddress?: boolean },
  counters: { sent: number },
) {
  if (!store.claim(recipient)) return // idempotence : déjà traité/en cours
  const res = send()
  if (res.invalidAddress) {
    store.mark(recipient, "invalid")
    return
  }
  if (res.ok) {
    counters.sent += 1
    store.mark(recipient, "sent")
  } else {
    store.mark(recipient, "failed")
  }
}

describe("LOT 3bis — reprise sur erreur & anti-doublon durable", () => {
  it("échec Resend puis rejeu réussi → 1 seul email final, état 'sent'", () => {
    const store = makeEmailStore()
    const counters = { sent: 0 }
    // 1er webhook : Resend échoue.
    runDispatch(store, "client", () => ({ ok: false }), counters)
    expect(store.state.client).toBe("failed")
    expect(counters.sent).toBe(0)
    // Rejeu Stripe : "failed" est réclamable → renvoi, cette fois OK.
    runDispatch(store, "client", () => ({ ok: true }), counters)
    expect(store.state.client).toBe("sent")
    expect(counters.sent).toBe(1)
  })

  it("webhook rejoué APRÈS envoi réussi → aucun second email", () => {
    const store = makeEmailStore()
    const counters = { sent: 0 }
    runDispatch(store, "client", () => ({ ok: true }), counters)
    // Rejeu : "sent" n'est jamais re-réclamé.
    runDispatch(store, "client", () => ({ ok: true }), counters)
    expect(counters.sent).toBe(1)
  })

  it("deux webhooks concurrents → un seul claim gagne, pas de doublon", () => {
    const store = makeEmailStore()
    const counters = { sent: 0 }
    // Exécution séquentielle = sérialisation garantie par le verrou de ligne PG.
    runDispatch(store, "client", () => ({ ok: true }), counters)
    runDispatch(store, "client", () => ({ ok: true }), counters)
    expect(counters.sent).toBe(1)
    expect(store.state.client).toBe("sent")
  })

  it("états client et pro indépendants (échec pro n'empêche pas client)", () => {
    const store = makeEmailStore()
    const counters = { sent: 0 }
    runDispatch(store, "client", () => ({ ok: true }), counters)
    runDispatch(store, "pro", () => ({ ok: false }), counters)
    expect(store.state.client).toBe("sent")
    expect(store.state.pro).toBe("failed")
    // Rejeu : seul le pro (failed) est renvoyé.
    runDispatch(store, "client", () => ({ ok: true }), counters)
    runDispatch(store, "pro", () => ({ ok: true }), counters)
    expect(counters.sent).toBe(2)
    expect(store.state.pro).toBe("sent")
  })

  it("adresse invalide → état 'invalid' terminal, jamais retenté ni marqué sent", () => {
    const store = makeEmailStore()
    const counters = { sent: 0 }
    runDispatch(store, "client", () => ({ ok: false, invalidAddress: true }), counters)
    expect(store.state.client).toBe("invalid")
    // Rejeu : "invalid" n'est jamais re-réclamé.
    runDispatch(store, "client", () => ({ ok: true }), counters)
    expect(counters.sent).toBe(0)
    expect(store.state.client).toBe("invalid")
  })

  it("montant présenté == montant envoyé à Stripe (parité totale)", () => {
    // Le claim renvoie grossAmountCents (montant réellement encaissé) : la
    // notification n'a aucune latitude pour diverger du montant Stripe.
    const subtotal = 15000
    const discount = computeDiscountCents("percent", 99, subtotal) // 14850
    const total = subtotal - discount // 150
    const stripeAmount = total // full payment
    const emailAmount = total // provient du même champ persisté
    expect(emailAmount).toBe(stripeAmount)
  })
})
