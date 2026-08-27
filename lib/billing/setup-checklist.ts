/**
 * Checklist « Configuration de votre facturation » — logique PURE et testable.
 *
 * Reflète l'état RÉEL du profil de facturation enregistré (jamais coché à la
 * main). N'invente aucune règle réglementaire : se contente de constater si un
 * champ est renseigné et si sa FORME est valide (via les profils pays existants).
 *
 * Trois états visuels :
 *  - "todo"   → À terminer (champ indispensable manquant) ;
 *  - "review" → À vérifier (présent mais forme douteuse, ou point à confirmer) ;
 *  - "done"   → Terminé.
 *
 * Deux natures :
 *  - mandatory     → indispensable pour une facturation en règle ;
 *  - recommendation→ conseillé mais NON bloquant.
 *
 * `anchor` = id de l'élément de formulaire vers lequel défiler (mise en évidence).
 */

import { getCountryProfile } from "@/lib/billing/country-profiles"

export type BillingSetupState = "todo" | "review" | "done"

export type BillingSetupItem = {
  key: string
  label: string
  hint: string
  state: BillingSetupState
  mandatory: boolean
  recommendation: boolean
  anchor: string
}

export type BillingSetupResult = {
  items: BillingSetupItem[]
  /** Progression en pourcentage entier sur l'ensemble des éléments applicables. */
  percent: number
  /** Nombre d'éléments non terminés (todo + review). */
  remaining: number
  /** Nombre d'éléments indispensables encore à terminer (état todo). */
  mandatoryTodo: number
  /** Nombre d'éléments « à vérifier ». */
  reviewCount: number
  /** Tous les éléments indispensables sont terminés (permet la confirmation). */
  allMandatoryDone: boolean
}

export type BillingSetupInput = {
  country: string | null | undefined
  confirmed: boolean
  legalForm: string | null | undefined
  legalRegistrationNumber: string | null | undefined
  vatNumber: string | null | undefined
  vatStatus: string | null | undefined
  vatEnabled: boolean
  vatExemptNote: string | null | undefined
  defaultCurrency: string | null | undefined
  invoiceCompanyAddress: string | null | undefined
  invoiceIban: string | null | undefined
  invoiceDueDays: number | null | undefined
  invoicePrefix: string | null | undefined
  frBusinessCategory: string | null | undefined
}

const has = (v: string | null | undefined) => Boolean(v && v.trim())

export function computeBillingSetup(input: BillingSetupInput): BillingSetupResult {
  const country = (input.country ?? "FR").toUpperCase()
  const profile = getCountryProfile(country)
  const vatStatus = (input.vatStatus ?? "unknown").toLowerCase()
  const items: BillingSetupItem[] = []

  // 1. Identité légale (forme juridique) — indispensable.
  items.push({
    key: "legalForm",
    label: "Identité légale",
    hint: "Votre forme juridique (ex. micro-entreprise, SASU, indépendant…).",
    mandatory: true,
    recommendation: false,
    anchor: "bp-legalForm",
    state: has(input.legalForm) && input.legalForm!.toLowerCase() !== "unknown" ? "done" : "todo",
  })

  // 2. Adresse de facturation — indispensable.
  items.push({
    key: "address",
    label: "Adresse de facturation",
    hint: "L'adresse légale imprimée sur vos factures.",
    mandatory: true,
    recommendation: false,
    anchor: "inv-address",
    state: has(input.invoiceCompanyAddress) ? "done" : "todo",
  })

  // 3. Pays — indispensable (confirmé).
  items.push({
    key: "country",
    label: "Pays de l'entreprise",
    hint: "Détermine les libellés légaux (SIREN, BCE, IDE/UID…).",
    mandatory: true,
    recommendation: false,
    anchor: "bp-country",
    state: input.confirmed ? "done" : "todo",
  })

  // 4. Numéro d'immatriculation — indispensable ; forme vérifiée.
  {
    const raw = input.legalRegistrationNumber
    let state: BillingSetupState = "todo"
    if (has(raw)) {
      const check = profile.validateLegalId(raw, false)
      state = check.valid ? "done" : "review"
    }
    items.push({
      key: "registration",
      label: profile.sellerLegalIdLabel,
      hint: "Votre numéro d'immatriculation d'entreprise.",
      mandatory: true,
      recommendation: false,
      anchor: "bp-legalNumber",
      state,
    })
  }

  // 5. Situation TVA — indispensable.
  items.push({
    key: "vatStatus",
    label: "Situation TVA",
    hint: "Facturez-vous la TVA, ou êtes-vous en franchise / exonération ?",
    mandatory: true,
    recommendation: false,
    anchor: "bp-vatStatus",
    state: vatStatus === "subject" || vatStatus === "exempt" ? "done" : "todo",
  })

  // 6. Numéro de TVA — indispensable UNIQUEMENT si redevable ; sinon conseillé.
  {
    const subject = vatStatus === "subject"
    const raw = input.vatNumber
    let state: BillingSetupState = subject ? "todo" : "done"
    if (has(raw)) {
      const check = profile.validateVatNumber(raw, false)
      state = check.valid ? "done" : "review"
    } else if (!subject) {
      // Non redevable : l'absence de n° de TVA est normale.
      state = "done"
    }
    items.push({
      key: "vatNumber",
      label: profile.vatNumberLabel,
      hint: subject
        ? "Obligatoire lorsque vous facturez la TVA."
        : "À renseigner uniquement si vous disposez d'un numéro de TVA.",
      mandatory: subject,
      recommendation: !subject,
      anchor: "bp-vatNumber",
      state,
    })
  }

  // 7. Mention d'exonération — indispensable si non redevable (TVA désactivée).
  if (vatStatus === "exempt" || !input.vatEnabled) {
    items.push({
      key: "exemptNote",
      label: "Mention d'exonération",
      hint: "La mention affichée sur vos factures sans TVA.",
      mandatory: vatStatus === "exempt",
      recommendation: vatStatus !== "exempt",
      anchor: "inv-vat",
      state: has(input.vatExemptNote) ? "done" : vatStatus === "exempt" ? "todo" : "review",
    })
  }

  // 8. Devise — indispensable.
  items.push({
    key: "currency",
    label: "Devise",
    hint: "La devise de vos factures (EUR, CHF…).",
    mandatory: true,
    recommendation: false,
    anchor: "bp-currency",
    state: has(input.defaultCurrency) ? "done" : "todo",
  })

  // 9. Conditions de paiement (délai) — conseillé.
  items.push({
    key: "dueDays",
    label: "Conditions de paiement",
    hint: "Le délai de paiement indiqué sur vos factures.",
    mandatory: false,
    recommendation: true,
    anchor: "inv-duedays",
    state: (input.invoiceDueDays ?? 0) > 0 ? "done" : "review",
  })

  // 10. Coordonnées bancaires — conseillé.
  items.push({
    key: "bank",
    label: "Coordonnées bancaires",
    hint: "IBAN pour permettre le virement de vos clients.",
    mandatory: false,
    recommendation: true,
    anchor: "inv-bank",
    state: has(input.invoiceIban) ? "done" : "review",
  })

  // 11. Numérotation — conseillé (préfixe par défaut FAC déjà présent).
  items.push({
    key: "numbering",
    label: "Numérotation des factures",
    hint: "Le préfixe de vos numéros de facture (ex. FAC-2026-0001).",
    mandatory: false,
    recommendation: true,
    anchor: "inv-numbering",
    state: has(input.invoicePrefix) ? "done" : "review",
  })

  // 12. Catégorie FR (calendrier e-invoicing) — à vérifier tant qu'inconnue.
  if (country === "FR") {
    const cat = (input.frBusinessCategory ?? "unknown").toLowerCase()
    items.push({
      key: "frCategory",
      label: "Catégorie d'entreprise (France)",
      hint: "Pour connaître votre échéance de facturation électronique.",
      mandatory: false,
      recommendation: true,
      anchor: "bp-frCategory",
      state: cat !== "unknown" && has(cat) ? "done" : "review",
    })
  }

  // 13. Confirmation finale — indispensable.
  items.push({
    key: "confirmation",
    label: "Confirmation du profil",
    hint: "Validez votre profil pour sécuriser vos prochaines factures.",
    mandatory: true,
    recommendation: false,
    anchor: "bp-confirm",
    state: input.confirmed ? "done" : "todo",
  })

  const total = items.length
  const doneCount = items.filter((i) => i.state === "done").length
  const remaining = items.filter((i) => i.state !== "done").length
  const mandatoryTodo = items.filter((i) => i.mandatory && i.state === "todo").length
  const reviewCount = items.filter((i) => i.state === "review").length

  return {
    items,
    percent: total === 0 ? 0 : Math.round((doneCount / total) * 100),
    remaining,
    mandatoryTodo,
    reviewCount,
    allMandatoryDone: items.filter((i) => i.mandatory).every((i) => i.state === "done"),
  }
}
