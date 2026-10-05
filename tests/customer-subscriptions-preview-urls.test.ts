import { describe, expect, it } from "vitest"
import { buildPaymentLinkUrl } from "@/lib/customer-subscriptions/payment-link"
import {
  assertAllowedReturnUrl,
  buildCustomerSubscriptionReturnUrl,
  previewDeploymentHost,
} from "@/lib/customer-subscriptions/return-url"

const PREVIEW = "detail-flow-git-v0-abc-detail01.vercel.app"
const prodCtx = { rootDomain: "detailflow.fr", allowLocalhost: false }
const previewCtx = { ...prodCtx, previewHost: PREVIEW }

describe("previewDeploymentHost", () => {
  it("retourne VERCEL_URL uniquement en Preview", () => {
    expect(previewDeploymentHost({ VERCEL_ENV: "preview", VERCEL_URL: PREVIEW })).toBe(PREVIEW)
    expect(previewDeploymentHost({ VERCEL_ENV: "production", VERCEL_URL: PREVIEW })).toBeNull()
    expect(previewDeploymentHost({ VERCEL_ENV: "preview" })).toBeNull()
    expect(previewDeploymentHost({ VERCEL_ENV: "preview", VERCEL_URL: "evil.com/x?y" })).toBeNull()
  })
})

describe("lien de paiement email", () => {
  it("Preview → VERCEL_URL, sans www, avec ?tenant=", () => {
    expect(buildPaymentLinkUrl("detailflow", "TOK", "www.detailflow.fr", PREVIEW)).toBe(
      `https://${PREVIEW}/abonnement-entretien/TOK?tenant=detailflow`,
    )
  })

  it("Preview → reste sur le Preview même pour un tenant à domaine custom", () => {
    expect(buildPaymentLinkUrl("spirit-acs", "TOK", "www.detailflow.fr", PREVIEW)).toBe(
      `https://${PREVIEW}/abonnement-entretien/TOK?tenant=spirit-acs`,
    )
  })

  it("Production sans domaine custom → www.detailflow.fr + ?tenant=", () => {
    expect(buildPaymentLinkUrl("detailflow", "TOK", "www.detailflow.fr", null)).toBe(
      "https://www.detailflow.fr/abonnement-entretien/TOK?tenant=detailflow",
    )
  })

  it("Production avec domaine custom → domaine custom", () => {
    expect(buildPaymentLinkUrl("spirit-acs", "TOK", "www.detailflow.fr", null)).toBe(
      "https://www.spiritacs.com/abonnement-entretien/TOK",
    )
  })
})

describe("return_url Stripe", () => {
  it("Preview → même hostname Preview, tenant conservé", () => {
    expect(buildCustomerSubscriptionReturnUrl("detailflow", previewCtx)).toBe(
      `https://${PREVIEW}/abonnement-entretien/retour?session_id={CHECKOUT_SESSION_ID}&tenant=detailflow`,
    )
  })

  it("Production sans domaine custom → www.detailflow.fr", () => {
    expect(buildCustomerSubscriptionReturnUrl("detailflow", prodCtx)).toBe(
      "https://www.detailflow.fr/abonnement-entretien/retour?session_id={CHECKOUT_SESSION_ID}&tenant=detailflow",
    )
  })

  it("Production avec domaine custom → domaine custom", () => {
    expect(buildCustomerSubscriptionReturnUrl("spirit-acs", prodCtx)).toBe(
      "https://www.spiritacs.com/abonnement-entretien/retour?session_id={CHECKOUT_SESSION_ID}",
    )
  })

  it("refuse une URL Preview arbitraire (hors Preview et autre hostname en Preview)", () => {
    const evil = "https://evil-git-x.vercel.app/abonnement-entretien/retour?session_id={CHECKOUT_SESSION_ID}"
    expect(() => assertAllowedReturnUrl(evil, "detailflow", prodCtx)).toThrow()
    expect(() => assertAllowedReturnUrl(evil, "detailflow", previewCtx)).toThrow()
    expect(() =>
      assertAllowedReturnUrl(`https://${PREVIEW}/abonnement-entretien/retour?session_id={CHECKOUT_SESSION_ID}`, "detailflow", prodCtx),
    ).toThrow()
  })
})
