/**
 * Message affiché au PRO (jamais à son client) sur la page d'une facture émise
 * quand elle ne peut pas sortir en Factur-X. Calculé côté serveur, pilotes
 * uniquement. Fonction pure : aucune donnée n'est lue hors de la facture.
 */
import type { InvoiceItemRow, InvoiceRow } from "./queries"
import type { FacturXError } from "./facturx/types"
import { canUseFacturX } from "./facturx-rollout"
import { checkFacturXReadiness } from "./facturx-eligibility"
import { toFacturXInput } from "./facturx-adapter"

/** Où le pro complète l'information manquante. */
export type FacturXFixPlace = "billing_profile" | "draft" | "support"

export type FacturXNoticeItem = { label: string; where: FacturXFixPlace }

export type FacturXNotice =
  /** Avoir sans échéance : règle de règlement non définie (rien à compléter). */
  | { kind: "credit_note_settlement" }
  | { kind: "missing"; items: FacturXNoticeItem[] }

const SETTINGS_FIELDS: Record<string, string> = {
  "invoice.issuerName": "Le nom de votre entreprise",
  "invoice.issuerCountry": "Le pays de votre entreprise",
  "invoice.issuerAddress": "L'adresse de votre entreprise",
  "invoice.issuerEmail": "L'e-mail de votre entreprise",
  "invoice.issuerLegalRegistrationNumber": "Votre identifiant d'entreprise (SIREN ou SIRET)",
  "invoice.issuerLegalRegistrationScheme": "Le type de votre identifiant d'entreprise",
  "invoice.issuerVatNumber": "Votre numéro de TVA",
  "invoice.issuerIban": "Votre IBAN",
  "invoice.issuerBic": "Votre BIC",
  "invoice.taxTreatment": "Votre régime de TVA",
  "invoice.taxLegalMention": "La mention d'exonération de TVA",
  "invoice.vatRate": "Votre taux de TVA",
  "invoice.currencyCode": "La devise de facturation",
}

const DRAFT_FIELDS: Record<string, string> = {
  "invoice.customerName": "Le nom du client",
  "invoice.customerCountry": "Le pays du client",
  "invoice.customerAddress": "L'adresse du client",
  "invoice.customerEmail": "L'e-mail du client",
  "invoice.customerVatNumber": "Le numéro de TVA du client",
  "invoice.customerLegalRegistrationNumber": "L'identifiant d'entreprise du client",
  "invoice.customerLegalRegistrationScheme": "Le type d'identifiant d'entreprise du client",
  "invoice.customerComment": "Le commentaire de la facture",
  "invoice.dueDate": "La date d'échéance",
  "invoice.serviceDate": "La date de la prestation",
  "invoice.creditReason": "Le motif de l'avoir",
  "items": "Au moins une ligne de facture",
}

/** Traduit les erreurs techniques du générateur en liste lisible, sans doublon. */
export function describeFacturXErrors(errors: readonly FacturXError[]): FacturXNotice {
  if (errors.some((e) => e.code === "CREDIT_NOTE_SETTLEMENT_UNDECIDED")) {
    return { kind: "credit_note_settlement" }
  }

  const items: FacturXNoticeItem[] = []
  const seen = new Set<string>()
  const push = (label: string, where: FacturXFixPlace) => {
    if (seen.has(label)) return
    seen.add(label)
    items.push({ label, where })
  }

  for (const e of errors) {
    if (e.code === "AMOUNT_MISMATCH") {
      push("Les montants de la facture sont incohérents", "support")
      continue
    }
    if (e.code === "TAX_DATA_CONFLICT") {
      push("Le régime de TVA ne correspond pas aux montants ou aux numéros de TVA", "billing_profile")
      continue
    }
    if (e.code === "ORIGINAL_INVOICE_REFERENCE_MISSING") {
      push("La facture d'origine de cet avoir", "support")
      continue
    }
    if (e.code === "INVALID_XML_CHARACTER") {
      push("Un texte de la facture contient un caractère non autorisé", "draft")
      continue
    }
    const settings = SETTINGS_FIELDS[e.field]
    if (settings) {
      push(settings, "billing_profile")
      continue
    }
    const draft = DRAFT_FIELDS[e.field] ?? (e.field.startsWith("items[") ? "Une ligne de facture" : null)
    if (draft) {
      push(draft, "draft")
      continue
    }
    push("Une information de la facture", "support")
  }

  // Ordre stable : paramètres du pro, puis brouillon, puis support.
  const rank: Record<FacturXFixPlace, number> = { billing_profile: 0, draft: 1, support: 2 }
  items.sort((a, b) => rank[a.where] - rank[b.where])
  return { kind: "missing", items }
}

/**
 * Message pour la page d'une facture émise. `companyId` provient du contexte
 * membre (requireCompanyMember) et la facture a été chargée filtrée par ce
 * même tenant. Renvoie null hors pilote, pour un brouillon, une facture
 * annulée ou une facture éligible.
 */
export function buildFacturXNotice(input: {
  companyId: number
  invoice: InvoiceRow
  items: readonly InvoiceItemRow[]
  originalRef?: { number: string | null; issueDate: string | null } | null
}): FacturXNotice | null {
  if (!canUseFacturX(input.companyId)) return null
  if (input.invoice.companyId !== input.companyId) return null
  if (input.invoice.status !== "issued" && input.invoice.status !== "paid") return null

  const readiness = checkFacturXReadiness(toFacturXInput(input.invoice, input.items, input.originalRef ?? null))
  if (readiness.eligible) return null
  return describeFacturXErrors(readiness.errors)
}
