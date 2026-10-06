/**
 * Fonctions PURES d'affichage pour l'espace pro (aucune I/O). Les textes sont
 * en langage métier : aucun terme technique ne doit en sortir.
 */
import type { ValidatedPlanConfig } from "./plan-validation"
import { withTenant } from "@/lib/tenant-link"
import {
  commitmentSentence,
  formatEuros,
  intervalSentence,
  reminderSentence,
  renewalSentence,
} from "./plan-form"

export type PlanChange = { label: string; before: string; after: string }

type ComparablePlan = Pick<
  ValidatedPlanConfig,
  | "priceCents"
  | "billingIntervalUnit"
  | "billingIntervalCount"
  | "includedUsesPerCycle"
  | "commitmentUnit"
  | "commitmentCount"
  | "renewalMode"
  | "renewalNoticeDays"
  | "allowRecurringPayment"
  | "allowPrepaidPayment"
  | "prepaidBillingCycles"
  | "initialCleaningRequired"
>

function paymentLabel(p: ComparablePlan): string {
  if (p.allowRecurringPayment && p.allowPrepaidPayment) return "Au choix du client"
  if (p.allowPrepaidPayment) return `Payé d'avance (${p.prepaidBillingCycles ?? 0} périodes)`
  return "Paiement automatique"
}

/** Différences visibles par le client entre la demande et la formule actuelle. */
export function planChanges(requested: ComparablePlan, current: ComparablePlan): PlanChange[] {
  const rows: Array<[string, (p: ComparablePlan) => string]> = [
    ["Prix", (p) => `${formatEuros(p.priceCents)} ${intervalSentence(p.billingIntervalUnit, p.billingIntervalCount)}`],
    ["Prestations incluses", (p) => `${p.includedUsesPerCycle} par période`],
    ["Engagement", (p) => commitmentSentence(p.commitmentUnit, p.commitmentCount)],
    [
      "Fin d'engagement",
      (p) => renewalSentence(p.renewalMode, p.commitmentUnit !== "none", p.allowRecurringPayment),
    ],
    ["Paiement", paymentLabel],
    ["Nettoyage initial", (p) => (p.initialCleaningRequired ? "Inclus" : "Aucun")],
    ["Rappel", (p) => reminderSentence(p.renewalNoticeDays)],
  ]
  const out: PlanChange[] = []
  for (const [label, fmt] of rows) {
    const before = fmt(requested)
    const after = fmt(current)
    if (before !== after) out.push({ label, before, after })
  }
  return out
}

export type ChecklistItem = { key: string; label: string; done: boolean; help: string; href?: string }

export function buildChecklist(input: {
  paymentsReady: boolean
  hasActivePlan: boolean
  publicMode: string
  tenant?: string | null
}): ChecklistItem[] {
  const tenant = input.tenant ?? null
  return [
    {
      key: "payments",
      label: "Recevoir les paiements en ligne",
      done: input.paymentsReady,
      help: "Connectez votre compte de paiement pour que vos clients puissent payer en ligne.",
      href: withTenant("/admin/parametres", tenant),
    },
    {
      key: "plan",
      label: "Créer votre première formule",
      done: input.hasActivePlan,
      help: "Une formule décrit ce que votre client reçoit et ce qu'il paie.",
      href: withTenant("/admin/abonnements-clients/formules/nouvelle", tenant),
    },
    {
      key: "public",
      label: "Proposer vos formules à vos clients",
      done: input.publicMode !== "disabled",
      help: "Choisissez comment vos clients peuvent rejoindre une formule.",
    },
  ]
}

/** Abonnements qui occupent une place (hors terminés). */
export const LIVE_STATUSES = new Set([
  "pending_initial_cleaning",
  "pending_payment",
  "active",
  "past_due",
  "cancel_scheduled",
  "suspended",
])
