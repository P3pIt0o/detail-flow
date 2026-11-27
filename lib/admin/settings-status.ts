import { hasDepositRule, resolvePaymentPlan } from "@/lib/booking/v2"
import { PLAN_MATRIX } from "@/lib/licensing/registry"
import type { FeatureKey } from "@/lib/licensing/types"
import type { PaymentMode } from "@/lib/payments/mode"
import { COMMERCIAL_PLANS } from "@/lib/pricing/plans"

/**
 * L97 — ligne d'état et point orange de chaque entrée de l'accueil des Paramètres.
 *
 * Module PUR : aucune lecture. L'appelant fournit des valeurs déjà lues pour
 * l'entreprise connectée. Le point orange n'apparaît que si le
 * fonctionnement en souffre, jamais pour un réglage masqué à ce tenant.
 */

export type SettingsStatusInput = {
  businessName: string | null | undefined
  businessEmail: string | null | undefined
  businessPhone: string | null | undefined
  locationSummary: string
  servicesCount: number
  openDaysCount: number
  vacationMode: boolean
  depositType: string
  /** Pourcentage, ou centimes pour un montant fixe. */
  depositValue: number
  paymentsEnabled: boolean
  /** Le compte de paiement peut encaisser. */
  paymentsReady: boolean
  paymentMode: PaymentMode
  /** La formule inclut les paiements en ligne. */
  onlinePaymentsAllowed: boolean
  billingComplete: boolean
  smsAllowed: boolean
  smsEnabled: boolean
  smsOffsetHours: number
  smsBalance: number
  customSiteKey: string | null | undefined
  onboardingIntent: string | null | undefined
}

export type SettingsStatusLine = { text: string; attention: boolean }

export type SettingsStatusId = "entreprise" | "services" | "reservations" | "site" | "billing" | "communications"

/** Nom commercial de la première formule qui inclut la fonction (droits lus dans PLAN_MATRIX). */
export function minimalPlanName(feature: FeatureKey): string | null {
  return COMMERCIAL_PLANS.find((p) => p.licensePlan && PLAN_MATRIX[p.licensePlan].features[feature])?.name ?? null
}

const filled = (v: string | null | undefined) => Boolean(v && v.trim())
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function depositLabel(type: string, value: number): string {
  if (value > 0 && (type === "percent" || type === "percentage")) return `Acompte de ${value} % demandé`
  if (value > 0 && type === "fixed") {
    const euros = (value / 100).toLocaleString("fr-FR", { minimumFractionDigits: value % 100 ? 2 : 0 })
    return `Acompte de ${euros} € demandé`
  }
  return "Aucun acompte demandé"
}

/** Ce que le client doit régler : même règle que la page de réservation. */
function paymentLabel(input: SettingsStatusInput): string {
  const plan = resolvePaymentPlan({
    paymentsReady: input.onlinePaymentsAllowed && input.paymentsEnabled && input.paymentsReady,
    mode: input.paymentMode,
    depositType: input.depositType,
    depositValue: input.depositValue,
  })
  const full = "Paiement intégral demandé en ligne"
  if (plan === "online_full") return full
  if (plan === "choice") {
    return hasDepositRule(input.depositType, input.depositValue) ? "Acompte ou totalité au choix du client" : full
  }
  return depositLabel(input.depositType, input.depositValue)
}

export function buildSettingsStatus(
  input: SettingsStatusInput,
): Partial<Record<SettingsStatusId, SettingsStatusLine>> {
  const spirit = input.customSiteKey === "spirit-acs"
  const out: Partial<Record<SettingsStatusId, SettingsStatusLine>> = {}

  const contactOk = filled(input.businessName) && filled(input.businessEmail) && filled(input.businessPhone)
  out.entreprise = {
    text: [contactOk ? "Nom et coordonnées renseignés" : "Coordonnées à compléter", spirit ? "" : input.locationSummary]
      .filter(Boolean)
      .join(" · "),
    attention: !contactOk,
  }

  if (!spirit) {
    out.services = input.servicesCount
      ? { text: `${plural(input.servicesCount, "prestation", "prestations")} · gabarits de véhicules`, attention: false }
      : { text: "Aucune prestation à réserver", attention: true }

    const open = input.openDaysCount
      ? `Ouvert ${plural(input.openDaysCount, "jour", "jours")} par semaine`
      : "Aucun jour d'ouverture"
    out.reservations = {
      text: input.vacationMode ? `${open} · mode vacances activé` : open,
      attention: input.openDaysCount === 0,
    }
  }

  out.site = {
    text: spirit
      ? "Textes du site, galerie et avis"
      : input.onboardingIntent === "booking_only"
        ? "Demandes spéciales et lien"
        : "Contenu, apparence, lien et QR code",
    attention: false,
  }

  const accountMissing = !spirit && input.paymentsEnabled && !input.paymentsReady
  const billing = [
    spirit ? "" : paymentLabel(input),
    input.billingComplete ? "facturation prête" : "facturation à compléter",
    accountMissing ? "compte de paiement à terminer" : "",
  ]
    .filter(Boolean)
    .join(" · ")
  out.billing = { text: capitalize(billing), attention: !input.billingComplete || accountMissing }

  if (!input.smsAllowed) {
    const plan = minimalPlanName("sms")
    out.communications = {
      text: plan ? `Rappels SMS : disponible avec ${plan}` : "Rappels SMS non inclus",
      attention: false,
    }
  } else if (!input.smsEnabled) {
    out.communications = { text: "Rappel SMS désactivé", attention: false }
  } else if (input.smsBalance <= 0) {
    out.communications = { text: "Rappel SMS activé, aucun crédit", attention: true }
  } else {
    out.communications = { text: `Rappel SMS ${input.smsOffsetHours} h avant`, attention: false }
  }

  return out
}
