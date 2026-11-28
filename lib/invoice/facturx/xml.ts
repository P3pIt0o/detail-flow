/**
 * ============================================================================
 *  FACTUR-X — GÉNÉRATEUR XML UN/CEFACT CII (LOT A) — fonction PURE
 * ============================================================================
 *  Produit le XML « CrossIndustryInvoice » (syntaxe CII D22B, Factur-X 1.0x,
 *  profil EN16931) d'une facture ou d'un avoir DetailFlow DÉJÀ ÉMIS.
 *
 *  Garanties :
 *   - AUCUN accès DB, réseau, horloge ou paramètre courant : le XML dépend
 *     UNIQUEMENT des snapshots transmis (facture + lignes + réf. d'origine).
 *     Une modification ultérieure du profil vendeur, du client, du catalogue
 *     ou de la TVA ne peut donc pas changer le XML d'une facture émise.
 *   - FAIL-CLOSED : une donnée EN16931 obligatoire absente ou incohérente
 *     produit une erreur structurée. Aucune valeur n'est inventée ni déduite.
 *   - Montants : les centimes stockés restent la source. Le XML les convertit
 *     en décimal par arithmétique entière (aucun float), et refuse toute
 *     facture dont les totaux stockés divergent du moteur de calcul existant
 *     (`computeInvoice`). Aucune comptabilité parallèle.
 *   - Toute valeur texte est échappée par le sérialiseur (aucune concaténation
 *     brute). Les caractères interdits en XML 1.0 sont refusés (pas supprimés).
 *
 *  FRANCE — NON PRÊT POUR LA RÉFORME : ce lot cible EN16931 seul. Le mapping
 *  EXTENDED-CTC-FR (réforme française de la facturation électronique) sera
 *  traité SÉPARÉMENT au LOT B. Les règles françaises utilisent notamment des
 *  emplacements spécifiques pour SIREN/SIRET ; le mapping actuel (identifiant
 *  légal en SpecifiedLegalOrganization avec ICD 0002/0009) n'est volontairement
 *  pas adapté à ces règles et ne doit pas être présenté comme tel.
 *
 *  NON couvert (LOT B/C) : validation XSD/Schematron officielle, règles
 *  françaises EXTENDED-CTC-FR, PDF/A-3 + embarquement, Plateforme Agréée.
 *  Ce module ne déclare JAMAIS un document « conforme ».
 * ============================================================================
 */

import { computeInvoice, type InvoiceLineKind } from "@/lib/invoice/calc"
import { isCreditNote, CREDIT_NOTE_DOCUMENT_TYPE, INVOICE_DOCUMENT_TYPE } from "@/lib/invoice/credit"
import { normalizeTaxTreatment, resolveTaxCalculation } from "@/lib/invoice/tax-treatment"
import {
  DOCUMENT_DISCOUNT_REASON,
  DOCUMENT_TYPE_CODE,
  ELECTRONIC_ADDRESS_SCHEME_EMAIL,
  FACTURX_GUIDELINE_ID,
  LEGAL_SCHEME_ICD,
  PAYMENT_MEANS_CREDIT_TRANSFER,
  UNIT_CODE_PIECE,
  VAT_CATEGORY_BY_TREATMENT,
  type FacturXProfile,
} from "./codes"
import type {
  BuildFacturXXmlInput,
  BuildFacturXXmlResult,
  FacturXError,
  FacturXErrorCode,
} from "./types"

export type * from "./types"
export { FACTURX_GUIDELINE_ID } from "./codes"

const PROFILE: FacturXProfile = "EN16931"

const NS = {
  rsm: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  qdt: "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
  udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
} as const

/* -------------------------------------------------------------------------- */
/*  Sérialisation XML sûre (échappement systématique)                         */
/* -------------------------------------------------------------------------- */

/** Caractères autorisés en XML 1.0 (tout le reste est refusé, jamais supprimé). */
const INVALID_XML_CHAR = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/u

/** Échappe une valeur texte ou d'attribut XML. Exportée pour les tests. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

type XmlNode = {
  tag: string
  attrs?: Record<string, string>
  text?: string
  children?: Array<XmlNode | null | undefined | false>
}

function serialize(node: XmlNode, depth: number): string {
  const pad = "  ".repeat(depth)
  const attrs = Object.entries(node.attrs ?? {})
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("")
  const kids = (node.children ?? []).filter((c): c is XmlNode => Boolean(c))
  if (node.text !== undefined) {
    // Garde défensive : le contrôle amont a déjà refusé ces caractères.
    if (INVALID_XML_CHAR.test(node.text)) throw new Error("Caractère XML invalide non filtré")
    return `${pad}<${node.tag}${attrs}>${escapeXml(node.text)}</${node.tag}>`
  }
  if (!kids.length) return `${pad}<${node.tag}${attrs}/>`
  return `${pad}<${node.tag}${attrs}>\n${kids.map((k) => serialize(k, depth + 1)).join("\n")}\n${pad}</${node.tag}>`
}

const n = (tag: string, children: XmlNode["children"], attrs?: Record<string, string>): XmlNode => ({
  tag,
  attrs,
  children,
})
const t = (tag: string, text: string, attrs?: Record<string, string>): XmlNode => ({ tag, attrs, text })

/* -------------------------------------------------------------------------- */
/*  Conversions déterministes                                                 */
/* -------------------------------------------------------------------------- */

/** Centimes (entier) -> décimal à 2 chiffres, sans float. 12345 -> "123.45". */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`Montant non entier : ${cents}`)
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  const units = Math.trunc(abs / 100)
  const rest = abs - units * 100
  return `${sign}${units}.${String(rest).padStart(2, "0")}`
}

/** "2026-10-09" -> "20261009" (format 102). null si invalide. */
function toDate102(value: string | null | undefined): string | null {
  const v = (value ?? "").trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const check = new Date(Date.UTC(y, mo - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null
  return `${m[1]}${m[2]}${m[3]}`
}

/**
 * Taux de TVA snapshoté (numeric Postgres en texte) -> décimal XML, sans float.
 * "20" / "20.00" -> "20" ; "8.10" -> "8.1". null si format inattendu.
 */
function normalizeRate(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim()
  const m = /^(\d{1,3})(?:\.(\d{1,6}))?$/.exec(v)
  if (!m) return null
  const intPart = String(Number(m[1]))
  const frac = (m[2] ?? "").replace(/0+$/, "")
  return frac ? `${intPart}.${frac}` : intPart
}

const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim()
  return s ? s : null
}

/* -------------------------------------------------------------------------- */
/*  Générateur                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Construit le XML CII (Factur-X, profil EN16931) d'une facture/avoir émis.
 * Retourne `{ ok: true, xml }` ou `{ ok: false, errors }` (jamais d'exception
 * pour une donnée manquante). Ne lit QUE les données transmises.
 */
export function buildFacturXXml(input: BuildFacturXXmlInput): BuildFacturXXmlResult {
  const inv = input.invoice
  const errors: FacturXError[] = []
  const fail = (code: FacturXErrorCode, field: string, message: string, rule?: string) =>
    errors.push(rule ? { code, field, rule, message } : { code, field, message })

  /** Valeur texte destinée au XML : contrôle des caractères XML 1.0. */
  const text = (field: string, value: string | null): string | null => {
    if (value != null && INVALID_XML_CHAR.test(value)) {
      fail("INVALID_XML_CHARACTER", field, "Caractère interdit en XML (caractère de contrôle ou invalide).")
      return null
    }
    return value
  }

  /* ---------------- Document ---------------- */
  const docType = inv.documentType
  const credit = isCreditNote(docType)
  if (docType !== INVOICE_DOCUMENT_TYPE && docType !== CREDIT_NOTE_DOCUMENT_TYPE) {
    fail("UNSUPPORTED_DOCUMENT_TYPE", "invoice.documentType", `Type de document non pris en charge : ${docType}.`)
  }

  if (inv.status === "draft") {
    fail("INVOICE_NOT_ISSUED", "invoice.status", "Un brouillon n'a pas de XML : émettez d'abord le document.")
  } else if (inv.status === "cancelled") {
    fail("INVOICE_CANCELLED", "invoice.status", "Document annulé : aucun XML généré dans ce lot.")
  } else if (inv.status !== "issued" && inv.status !== "paid") {
    fail("INVALID_FIELD", "invoice.status", `Statut inattendu : ${inv.status}.`)
  }

  const number = text("invoice.number", clean(inv.number))
  if (!number) fail("MISSING_FIELD", "invoice.number", "Numéro de facture absent.", "BR-02")

  const issueDate = toDate102(inv.issueDate)
  if (!issueDate) fail("MISSING_FIELD", "invoice.issueDate", "Date d'émission absente ou invalide.", "BR-03")

  const currency = clean(inv.currencyCode)?.toUpperCase() ?? null
  if (!currency) {
    fail("MISSING_FIELD", "invoice.currencyCode", "Devise non snapshotée sur la facture (aucune devise par défaut n'est supposée).", "BR-05")
  } else if (!/^[A-Z]{3}$/.test(currency)) {
    fail("INVALID_FIELD", "invoice.currencyCode", `Code devise ISO 4217 invalide : ${currency}.`, "BR-05")
  }

  let dueDate: string | null = null
  if (clean(inv.dueDate)) {
    dueDate = toDate102(inv.dueDate)
    if (!dueDate) fail("INVALID_FIELD", "invoice.dueDate", "Date d'échéance invalide.")
  }

  let serviceDate: string | null = null
  if (clean(inv.serviceDate)) {
    serviceDate = toDate102(inv.serviceDate)
    if (!serviceDate) fail("INVALID_FIELD", "invoice.serviceDate", "Date de prestation invalide.")
  }

  /* ---------------- Vendeur (snapshot) ---------------- */
  const sellerName = text("invoice.issuerName", clean(inv.issuerName))
  if (!sellerName) fail("MISSING_FIELD", "invoice.issuerName", "Raison sociale du vendeur absente du snapshot.", "BR-06")

  const sellerCountry = clean(inv.issuerCountry)?.toUpperCase() ?? null
  if (!sellerCountry) {
    fail("MISSING_FIELD", "invoice.issuerCountry", "Pays du vendeur absent du snapshot (profil de facturation non confirmé à l'émission).", "BR-09")
  } else if (!/^[A-Z]{2}$/.test(sellerCountry)) {
    fail("INVALID_FIELD", "invoice.issuerCountry", `Code pays ISO 3166-1 invalide : ${sellerCountry}.`, "BR-09")
  }

  const sellerAddress = text("invoice.issuerAddress", clean(inv.issuerAddress))
  const sellerEmail = text("invoice.issuerEmail", clean(inv.issuerEmail))
  const sellerLegal = text("invoice.issuerLegalRegistrationNumber", clean(inv.issuerLegalRegistrationNumber))
  const sellerSchemeId = resolveScheme(
    sellerLegal,
    inv.issuerLegalRegistrationScheme,
    "invoice.issuerLegalRegistrationScheme",
    fail,
  )
  const sellerVat = text("invoice.issuerVatNumber", clean(inv.issuerVatNumber))
  if (!sellerLegal && !sellerVat) {
    fail(
      "MISSING_FIELD",
      "invoice.issuerLegalRegistrationNumber",
      "Le vendeur doit avoir un identifiant légal ou un numéro de TVA snapshoté.",
      "BR-CO-26",
    )
  }

  /* ---------------- Acheteur (snapshot) ---------------- */
  const buyerName = text("invoice.customerName", clean(inv.customerName))
  if (!buyerName) fail("MISSING_FIELD", "invoice.customerName", "Nom de l'acheteur absent.", "BR-07")

  const buyerCountry = clean(inv.customerCountry)?.toUpperCase() ?? null
  if (!buyerCountry) {
    fail("MISSING_FIELD", "invoice.customerCountry", "Pays de l'acheteur absent du snapshot.", "BR-11")
  } else if (!/^[A-Z]{2}$/.test(buyerCountry)) {
    fail("INVALID_FIELD", "invoice.customerCountry", `Code pays ISO 3166-1 invalide : ${buyerCountry}.`, "BR-11")
  }

  const buyerAddress = text("invoice.customerAddress", clean(inv.customerAddress))
  const buyerEmail = text("invoice.customerEmail", clean(inv.customerEmail))
  // Comme le PDF : un particulier ou un type inconnu n'expose jamais
  // d'identifiant d'entreprise ni de numéro de TVA, même s'il en reste un en DB.
  const buyerIsBusiness = (inv.customerType ?? "").trim() === "business"
  const buyerLegal = buyerIsBusiness
    ? text("invoice.customerLegalRegistrationNumber", clean(inv.customerLegalRegistrationNumber))
    : null
  const buyerSchemeId = resolveScheme(
    buyerLegal,
    inv.customerLegalRegistrationScheme,
    "invoice.customerLegalRegistrationScheme",
    fail,
  )
  const buyerVat = buyerIsBusiness ? text("invoice.customerVatNumber", clean(inv.customerVatNumber)) : null

  /* ---------------- TVA : traitement EXPLICITE snapshoté ---------------- */
  const treatment = normalizeTaxTreatment(inv.taxTreatment)
  const category = treatment ? VAT_CATEGORY_BY_TREATMENT[treatment] : null
  let rate: string | null = null // null => pas de taux émis (catégorie O)
  const exemptionReason = text("invoice.taxLegalMention", clean(inv.taxLegalMention))

  /*
   * Identification fiscale du vendeur (BR-S-02 / BR-E-02 / BR-AE-02).
   * EN16931 accepte, selon la règle, l'un de ces identifiants :
   *   - BT-31 identifiant TVA du vendeur ;
   *   - BT-32 identifiant d'enregistrement fiscal du vendeur ;
   *   - BT-63 identifiant TVA du représentant fiscal.
   * DetailFlow ne snapshotte AUJOURD'HUI que BT-31 (issuerVatNumber). Il n'existe
   * ni champ BT-32 distinct ni représentant fiscal. On n'invente donc rien :
   *   - aucun SIREN/SIRET (ni autre identifiant légal BT-30) n'est réutilisé
   *     comme BT-32 — ce sont des données de nature différente ;
   *   - aucun numéro de TVA n'est fabriqué.
   * Sans BT-31 snapshoté, la règle ne peut pas être satisfaite avec les données
   * disponibles : erreur fail-closed (message explicite ci-dessous).
   */
  const sellerTaxIdUnavailable = (situation: string) =>
    `${situation} : EN16931 exige un identifiant fiscal du vendeur (BT-31 TVA, BT-32 enregistrement fiscal ou BT-63 représentant fiscal). ` +
    "DetailFlow ne dispose actuellement pas d'un identifiant fiscal EN16931 alternatif snapshoté (seul BT-31 est stocké, et il est absent). " +
    "Aucun SIREN/SIRET n'est réutilisé comme identifiant fiscal."

  if (!treatment) {
    fail(
      "TAX_TREATMENT_MISSING",
      "invoice.taxTreatment",
      "Traitement fiscal non snapshoté (facture legacy) : la catégorie de TVA n'est pas déduite.",
    )
  } else if (category === "S") {
    rate = normalizeRate(inv.vatRate)
    if (rate == null || rate === "0") {
      fail("INVALID_FIELD", "invoice.vatRate", "Taux de TVA absent, nul ou invalide pour une TVA normale.", "BR-S-05")
    }
    if (!sellerVat) fail("MISSING_FIELD", "invoice.issuerVatNumber", sellerTaxIdUnavailable("TVA normale"), "BR-S-02")
  } else {
    if (inv.vatCents !== 0) {
      fail("TAX_DATA_CONFLICT", "invoice.vatCents", `Traitement ${treatment} avec un montant de TVA non nul.`)
    }
    if (!exemptionReason) {
      const rule = category === "E" ? "BR-E-10" : category === "AE" ? "BR-AE-10" : "BR-O-10"
      fail("MISSING_FIELD", "invoice.taxLegalMention", `Traitement ${treatment} : mention fiscale (motif d'exonération) absente.`, rule)
    }
    if (category === "E") {
      rate = "0"
      if (!sellerVat) fail("MISSING_FIELD", "invoice.issuerVatNumber", sellerTaxIdUnavailable("Exonération"), "BR-E-02")
    } else if (category === "AE") {
      rate = "0"
      if (!sellerVat) fail("MISSING_FIELD", "invoice.issuerVatNumber", sellerTaxIdUnavailable("Autoliquidation"), "BR-AE-02")
      // Côté acheteur, BR-AE-02 accepte BT-48 (TVA) et/ou BT-47 (identifiant légal) :
      // ici l'identifiant légal snapshoté est bien une donnée admise par la règle.
      if (!buyerVat && !buyerLegal) {
        fail(
          "MISSING_FIELD",
          "invoice.customerVatNumber",
          "Autoliquidation : EN16931 exige l'identifiant TVA (BT-48) et/ou l'identifiant légal (BT-47) de l'acheteur entreprise ; aucun n'est snapshoté.",
          "BR-AE-02",
        )
      }
    } else if (category === "O") {
      rate = null
      if (sellerVat) fail("TAX_DATA_CONFLICT", "invoice.issuerVatNumber", "Hors champ : le numéro de TVA vendeur ne doit pas figurer.", "BR-O-02")
      if (buyerVat) fail("TAX_DATA_CONFLICT", "invoice.customerVatNumber", "Hors champ : le numéro de TVA acheteur ne doit pas figurer.", "BR-O-02")
    }
  }

  /* ---------------- Lignes ---------------- */
  if (!input.items.length) fail("MISSING_FIELD", "items", "Aucune ligne de facture.", "BR-16")
  const sorted = input.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.sortOrder - b.item.sortOrder || a.index - b.index)

  const lines = sorted.map(({ item, index }) => {
    const path = `items[${index}]`
    const label = text(`${path}.label`, clean(item.label))
    if (!label) fail("MISSING_FIELD", `${path}.label`, "Libellé de ligne absent.", "BR-25")
    const description = text(`${path}.description`, clean(item.description))
    const okQty = Number.isSafeInteger(item.quantity)
    const okUnit = Number.isSafeInteger(item.unitPriceCents)
    if (!okQty) fail("INVALID_FIELD", `${path}.quantity`, "Quantité non entière.")
    if (!okUnit) fail("INVALID_FIELD", `${path}.unitPriceCents`, "Prix unitaire non entier (centimes).")
    else if (item.unitPriceCents < 0) fail("INVALID_FIELD", `${path}.unitPriceCents`, "Prix unitaire négatif.", "BR-27")
    const amount = okQty && okUnit ? item.quantity * item.unitPriceCents : 0
    if (!Number.isSafeInteger(amount)) fail("INVALID_FIELD", `${path}`, "Montant de ligne hors limites.")
    return { item, label, description, amount }
  })

  /* ---------------- Montants : snapshot vs moteur existant ---------------- */
  const centsFields = [
    "itemsTotalCents",
    "discountCents",
    "netCents",
    "vatCents",
    "totalCents",
    "depositCents",
    "paidCents",
    "balanceCents",
  ] as const
  let amountsOk = true
  for (const key of centsFields) {
    const v = inv[key]
    if (!Number.isSafeInteger(v) || v < 0) {
      amountsOk = false
      fail("INVALID_FIELD", `invoice.${key}`, "Montant stocké invalide (entier positif attendu, en centimes).")
    }
  }

  let prepaidCents = 0
  let dueCents = 0
  if (amountsOk && treatment) {
    // Recalcul de CONTRÔLE avec les fonctions existantes (jamais réécrit).
    const tax = resolveTaxCalculation({ taxTreatment: treatment, legacyVatEnabled: inv.vatEnabled, vatRate: Number(inv.vatRate) })
    const expected = computeInvoice({
      lines: lines.map(({ item }) => ({
        kind: item.kind as InvoiceLineKind,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      })),
      discountCents: inv.discountCents,
      vatEnabled: tax.vatEnabled,
      vatRate: tax.vatRate,
      depositCents: credit ? 0 : inv.depositCents,
      paidCents: credit ? 0 : inv.paidCents,
    })
    const compared = credit
      ? (["itemsTotalCents", "discountCents", "netCents", "vatCents", "totalCents"] as const)
      : centsFields
    for (const key of compared) {
      if (expected[key] !== inv[key]) {
        fail("AMOUNT_MISMATCH", `invoice.${key}`, `Montant stocké (${inv[key]}) différent du moteur DetailFlow (${expected[key]}).`)
      }
    }
    // BR-CO-13 : base taxable = total lignes − remise (aucun plancher implicite).
    if (inv.itemsTotalCents - inv.discountCents !== inv.netCents) {
      fail("AMOUNT_MISMATCH", "invoice.discountCents", "Remise supérieure au total des lignes.", "BR-CO-13")
    }
    if (credit) {
      if (inv.depositCents !== 0 || inv.paidCents !== 0) {
        fail("AMOUNT_MISMATCH", "invoice.paidCents", "Un avoir ne porte ni acompte ni paiement.")
      }
      /*
       * AVOIRS — MAPPING NON TRANCHÉ (LOT A).
       * DetailFlow émet aujourd'hui ses avoirs avec paidCents = 0, balanceCents = 0
       * et dueDate = NULL. En CII, DuePayableAmount (BT-115) doit valoir
       * GrandTotal − Prepaid (BR-CO-16), soit le total crédité, et un BT-115 positif
       * exige une échéance ou des conditions de règlement (BR-CO-25), que l'avoir
       * ne porte pas. Choisir comment représenter le règlement d'un avoir est une
       * décision comptable qui reste à prendre : on refuse donc de générer un XML
       * potentiellement faux, sans fabriquer de date ni modifier l'avoir.
       *
       * Si une échéance est snapshotée sur l'avoir (cas non produit aujourd'hui
       * par DetailFlow), BT-115 = total crédité, conformément à BR-CO-16.
       * Ce chemin ne signifie PAS que les avoirs de production sont pris en charge.
       */
      prepaidCents = 0
      dueCents = inv.totalCents
      if (dueCents > 0 && !dueDate) {
        fail(
          "CREDIT_NOTE_SETTLEMENT_UNDECIDED",
          "invoice.dueDate",
          "Avoir DetailFlow sans échéance ni conditions de règlement : le mapping DuePayableAmount / règlement d'un avoir reste à trancher avant toute génération XML.",
          "BR-CO-25",
        )
      }
    } else {
      prepaidCents = inv.depositCents + inv.paidCents
      dueCents = inv.totalCents - prepaidCents
      if (dueCents < 0) {
        fail("AMOUNT_MISMATCH", "invoice.paidCents", "Montant réglé supérieur au total TTC (trop-perçu).", "BR-CO-16")
      } else if (dueCents !== inv.balanceCents) {
        fail("AMOUNT_MISMATCH", "invoice.balanceCents", "Solde stocké incohérent avec total − acompte − paiements.", "BR-CO-16")
      }
      if (dueCents > 0 && !dueDate) {
        fail("MISSING_PAYMENT_DUE_DATE", "invoice.dueDate", "Montant dû positif sans date d'échéance snapshotée.", "BR-CO-25")
      }
    }
  }

  /* ---------------- Avoir : référence de la facture d'origine ---------------- */
  let originalNumber: string | null = null
  let originalDate: string | null = null
  if (input.originalInvoice && !credit) {
    fail("INVALID_FIELD", "originalInvoice", "Référence de facture d'origine fournie pour une facture (réservée aux avoirs).")
  }
  if (credit && (inv.originalInvoiceId != null || input.originalInvoice)) {
    originalNumber = text("originalInvoice.number", clean(input.originalInvoice?.number))
    if (!originalNumber) {
      fail(
        "ORIGINAL_INVOICE_REFERENCE_MISSING",
        "originalInvoice.number",
        "Avoir rattaché à une facture : numéro de la facture d'origine requis.",
        "BG-3",
      )
    }
    if (clean(input.originalInvoice?.issueDate)) {
      originalDate = toDate102(input.originalInvoice?.issueDate)
      if (!originalDate) fail("INVALID_FIELD", "originalInvoice.issueDate", "Date de la facture d'origine invalide.")
    }
  }

  /* ---------------- Textes libres ---------------- */
  const creditReason = credit ? text("invoice.creditReason", clean(inv.creditReason)) : null
  const comment = text("invoice.customerComment", clean(inv.customerComment))
  const iban = credit ? null : text("invoice.issuerIban", clean(inv.issuerIban))
  const bic = iban ? text("invoice.issuerBic", clean(inv.issuerBic)) : null

  if (errors.length) return { ok: false, errors }

  /* ======================= Construction du XML ======================= */
  const cur = currency as string
  const amount = (tag: string, cents: number, withCurrency = false) =>
    t(tag, centsToDecimal(cents), withCurrency ? { currencyID: cur } : undefined)
  const date102 = (tag: string, value: string) => n(tag, [t("udt:DateTimeString", value, { format: "102" })])
  const taxNode = (tag: string, extra: XmlNode[] = [], reason: XmlNode | null = null, basis: XmlNode | null = null) =>
    n(tag, [
      ...extra,
      t("ram:TypeCode", "VAT"),
      reason,
      basis,
      t("ram:CategoryCode", category as string),
      rate != null ? t("ram:RateApplicablePercent", rate) : null,
    ])
  const reasonNode = category !== "S" && exemptionReason ? t("ram:ExemptionReason", exemptionReason) : null

  const party = (
    tag: string,
    p: {
      name: string
      legal: string | null
      schemeId: string | null | undefined
      address: string | null
      country: string
      email: string | null
      vat: string | null
    },
  ) =>
    n(tag, [
      t("ram:Name", p.name),
      // Identifiant légal (BT-30 / BT-47), mapping EN16931 uniquement. Les
      // emplacements SIREN/SIRET propres à EXTENDED-CTC-FR relèvent du LOT B.
      // Jamais réémis comme identifiant fiscal (BT-32, schemeID « FC »).
      p.legal
        ? n("ram:SpecifiedLegalOrganization", [t("ram:ID", p.legal, p.schemeId ? { schemeID: p.schemeId } : undefined)])
        : null,
      n("ram:PostalTradeAddress", [p.address ? t("ram:LineOne", p.address) : null, t("ram:CountryID", p.country)]),
      p.email
        ? n("ram:URIUniversalCommunication", [t("ram:URIID", p.email, { schemeID: ELECTRONIC_ADDRESS_SCHEME_EMAIL })])
        : null,
      p.vat ? n("ram:SpecifiedTaxRegistration", [t("ram:ID", p.vat, { schemeID: "VA" })]) : null,
    ])

  const lineNodes = lines.map(({ item, label, description, amount: lineCents }, i) =>
    n("ram:IncludedSupplyChainTradeLineItem", [
      n("ram:AssociatedDocumentLineDocument", [t("ram:LineID", String(i + 1))]),
      n("ram:SpecifiedTradeProduct", [
        t("ram:Name", label as string),
        description ? t("ram:Description", description) : null,
      ]),
      n("ram:SpecifiedLineTradeAgreement", [
        n("ram:NetPriceProductTradePrice", [amount("ram:ChargeAmount", item.unitPriceCents)]),
      ]),
      n("ram:SpecifiedLineTradeDelivery", [
        t("ram:BilledQuantity", String(item.quantity), { unitCode: UNIT_CODE_PIECE }),
      ]),
      n("ram:SpecifiedLineTradeSettlement", [
        taxNode("ram:ApplicableTradeTax"),
        n("ram:SpecifiedTradeSettlementLineMonetarySummation", [amount("ram:LineTotalAmount", lineCents)]),
      ]),
    ]),
  )

  const notes = [creditReason, comment]
    .filter((s): s is string => Boolean(s))
    .map((content) => n("ram:IncludedNote", [t("ram:Content", content)]))

  const root = n(
    "rsm:CrossIndustryInvoice",
    [
      n("rsm:ExchangedDocumentContext", [
        n("ram:GuidelineSpecifiedDocumentContextParameter", [t("ram:ID", FACTURX_GUIDELINE_ID[PROFILE])]),
      ]),
      n("rsm:ExchangedDocument", [
        t("ram:ID", number as string),
        t("ram:TypeCode", credit ? DOCUMENT_TYPE_CODE.credit_note : DOCUMENT_TYPE_CODE.invoice),
        date102("ram:IssueDateTime", issueDate as string),
        ...notes,
      ]),
      n("rsm:SupplyChainTradeTransaction", [
        ...lineNodes,
        n("ram:ApplicableHeaderTradeAgreement", [
          party("ram:SellerTradeParty", {
            name: sellerName as string,
            legal: sellerLegal,
            schemeId: sellerSchemeId,
            address: sellerAddress,
            country: sellerCountry as string,
            email: sellerEmail,
            vat: sellerVat,
          }),
          party("ram:BuyerTradeParty", {
            name: buyerName as string,
            legal: buyerLegal,
            schemeId: buyerSchemeId,
            address: buyerAddress,
            country: buyerCountry as string,
            email: buyerEmail,
            vat: buyerVat,
          }),
        ]),
        n("ram:ApplicableHeaderTradeDelivery", [
          serviceDate
            ? n("ram:ActualDeliverySupplyChainEvent", [date102("ram:OccurrenceDateTime", serviceDate)])
            : null,
        ]),
        n("ram:ApplicableHeaderTradeSettlement", [
          t("ram:InvoiceCurrencyCode", cur),
          iban
            ? n("ram:SpecifiedTradeSettlementPaymentMeans", [
                t("ram:TypeCode", PAYMENT_MEANS_CREDIT_TRANSFER),
                n("ram:PayeePartyCreditorFinancialAccount", [t("ram:IBANID", iban)]),
                bic ? n("ram:PayeeSpecifiedCreditorFinancialInstitution", [t("ram:BICID", bic)]) : null,
              ])
            : null,
          taxNode(
            "ram:ApplicableTradeTax",
            [amount("ram:CalculatedAmount", inv.vatCents)],
            reasonNode,
            amount("ram:BasisAmount", inv.netCents),
          ),
          inv.discountCents > 0
            ? n("ram:SpecifiedTradeAllowanceCharge", [
                n("ram:ChargeIndicator", [t("udt:Indicator", "false")]),
                amount("ram:ActualAmount", inv.discountCents),
                t("ram:Reason", DOCUMENT_DISCOUNT_REASON),
                taxNode("ram:CategoryTradeTax"),
              ])
            : null,
          dueDate ? n("ram:SpecifiedTradePaymentTerms", [date102("ram:DueDateDateTime", dueDate)]) : null,
          n("ram:SpecifiedTradeSettlementHeaderMonetarySummation", [
            amount("ram:LineTotalAmount", inv.itemsTotalCents),
            amount("ram:ChargeTotalAmount", 0),
            amount("ram:AllowanceTotalAmount", inv.discountCents),
            amount("ram:TaxBasisTotalAmount", inv.netCents),
            amount("ram:TaxTotalAmount", inv.vatCents, true),
            amount("ram:GrandTotalAmount", inv.totalCents),
            amount("ram:TotalPrepaidAmount", prepaidCents),
            amount("ram:DuePayableAmount", dueCents),
          ]),
          originalNumber
            ? n("ram:InvoiceReferencedDocument", [
                t("ram:IssuerAssignedID", originalNumber),
                originalDate
                  ? n("ram:FormattedIssueDateTime", [t("qdt:DateTimeString", originalDate, { format: "102" })])
                  : null,
              ])
            : null,
        ]),
      ]),
    ],
    { "xmlns:rsm": NS.rsm, "xmlns:qdt": NS.qdt, "xmlns:ram": NS.ram, "xmlns:udt": NS.udt },
  )

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${serialize(root, 0)}\n`
  return { ok: true, xml, profile: PROFILE }
}

/**
 * Scheme snapshoté -> code ICD. Retourne :
 *  - undefined : pas d'identifiant ou scheme non snapshoté (ID émis sans schemeID) ;
 *  - null      : scheme GENERIC connu sans code ICD (ID émis sans schemeID) ;
 *  - string    : code ICD. Un scheme inconnu produit une erreur (jamais deviné).
 */
function resolveScheme(
  legal: string | null,
  rawScheme: string | null | undefined,
  field: string,
  fail: (code: FacturXErrorCode, field: string, message: string, rule?: string) => void,
): string | null | undefined {
  if (!legal) return undefined
  const scheme = clean(rawScheme)?.toUpperCase()
  if (!scheme) return undefined
  if (!(scheme in LEGAL_SCHEME_ICD)) {
    fail("UNKNOWN_LEGAL_SCHEME", field, `Scheme d'identifiant légal inconnu : ${scheme}.`)
    return undefined
  }
  return LEGAL_SCHEME_ICD[scheme]
}

/** Export interne pour les tests unitaires (aucun usage applicatif). */
export const __test__ = { toDate102, normalizeRate }
