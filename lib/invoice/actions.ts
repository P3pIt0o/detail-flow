"use server"

/**
 * ============================================================================
 *  ACTIONS FACTURATION (serveur) — multi-tenant
 * ============================================================================
 *  Cycle de vie : draft (brouillon éditable) → issued (émise, figée, numérotée)
 *  → paid (soldée). Toutes les actions exigent une session admin membre de
 *  l'entreprise courante. Chaque facture est strictement rattachée à un
 *  `companyId` : une facture d'une autre entreprise est invisible/inaccessible.
 *  Les montants sont snapshotés : modifier le catalogue ne change jamais une
 *  facture existante. La numérotation est propre à chaque entreprise.
 * ============================================================================
 */

import { revalidatePath } from "next/cache"
import { and, eq, gte, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  invoices,
  invoiceItems,
  invoicePayments,
  invoiceEvents,
  bookings,
  bookingItems,
  bookingItemOptions,
  companies as companiesTable,
  settings as settingsTable,
} from "@/lib/db/schema"
import { requireCompanyMember } from "@/lib/admin"
import { computeInvoice, type InvoiceLineKind } from "@/lib/invoice/calc"
import { formatMoney } from "@/lib/format"
import { isTaxTreatment, normalizeTaxTreatment, resolveTaxCalculation, type TaxTreatment } from "@/lib/invoice/tax-treatment"
import { canCreateWithinLimit, LIMIT_REACHED_MESSAGE } from "@/lib/licensing/enforce"
import { getCountryProfile, resolveIssuerBillingSnapshot, resolveDraftCurrency } from "@/lib/billing/country-profiles"
import {
  CREDIT_NOTE_DOCUMENT_TYPE,
  CREDITABLE_INVOICE_STATUSES,
  canIssueCredit,
  clampCreditLineQuantity,
  clampCreditUnitPrice,
  isCreditNote,
  remainingLineQuantity,
  validateCreditReason,
} from "@/lib/invoice/credit"

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

function revalidate() {
  revalidatePath("/admin", "layout")
}

async function logEvent(invoiceId: number, type: string, message?: string) {
  await db.insert(invoiceEvents).values({ invoiceId, type, message: message ?? null })
}

/**
 * Charge une facture en vérifiant qu'elle appartient bien à l'entreprise
 * courante. Renvoie `null` si absente OU appartenant à une autre entreprise
 * (erreur neutre — ne révèle pas l'existence inter-tenant).
 */
async function loadOwnedInvoice(invoiceId: number, companyId: number) {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1)
  return inv ?? null
}

/* -------------------------------------------------------------------------- */
/*  Recalcul + persistance des totaux                                         */
/* -------------------------------------------------------------------------- */

/** Recalcule les totaux d'une facture depuis ses lignes + paiements + acompte. */
async function recalcInvoice(invoiceId: number) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  if (!inv) return
  const lines = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId))
  const paidAgg = await db
    .select({ total: sql<number>`coalesce(sum(${invoicePayments.amountCents}), 0)` })
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, invoiceId))
  const paidCents = Number(paidAgg[0]?.total ?? 0)

  // Le traitement fiscal (snapshoté) pilote vatEnabled/vatRate AVANT le calcul
  // mécanique. computeInvoice reste une fonction mathématique pure (aucune
  // notion de traitement fiscal). Legacy (null) => comportement historique.
  const effectiveTax = resolveTaxCalculation({
    taxTreatment: normalizeTaxTreatment(inv.taxTreatment),
    legacyVatEnabled: inv.vatEnabled,
    vatRate: Number(inv.vatRate),
  })

  const result = computeInvoice({
    lines: lines.map((l) => ({
      kind: l.kind as InvoiceLineKind,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
    })),
    discountCents: inv.discountCents,
    vatEnabled: effectiveTax.vatEnabled,
    vatRate: effectiveTax.vatRate,
    depositCents: inv.depositCents,
    paidCents,
  })

  await db
    .update(invoices)
    .set({
      itemsTotalCents: result.itemsTotalCents,
      netCents: result.netCents,
      vatCents: result.vatCents,
      totalCents: result.totalCents,
      paidCents: result.paidCents,
      balanceCents: result.balanceCents,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId))

  return result
}

/* -------------------------------------------------------------------------- */
/*  Création d'une facture depuis une réservation terminée                    */
/* -------------------------------------------------------------------------- */

export async function createInvoiceFromBooking(
  bookingId: number,
): Promise<ActionResult<{ invoiceId: number; existed: boolean }>> {
  const { tenant } = await requireCompanyMember()
  const companyId = tenant.id

  // Réservation : doit appartenir à l'entreprise courante.
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.companyId, companyId)))
    .limit(1)
  if (!booking) return { ok: false, error: "Réservation introuvable." }
  if (booking.status !== "completed") {
    return { ok: false, error: "La facture ne peut être générée que pour une réservation terminée." }
  }

  // Facture déjà existante pour cette réservation ? (idempotent, scopé entreprise)
  const existing = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.bookingId, bookingId), eq(invoices.companyId, companyId)))
    .limit(1)
  if (existing.length) {
    return { ok: true, data: { invoiceId: existing[0].id, existed: true } }
  }

  // Limite de licence (maxInvoicesPerMonth) — compte les factures du MOIS COURANT
  // pour l'entreprise courante (scope companyId serveur). Bloque uniquement la
  // création d'une NOUVELLE facture ; ne concerne jamais une réservation ni une
  // facture déjà créée (retour idempotent ci-dessus). LEGACY => null => illimité.
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const [monthAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        // Les avoirs ne consomment JAMAIS le quota mensuel de factures.
        eq(invoices.documentType, "invoice"),
        gte(invoices.createdAt, monthStart),
      ),
    )
  const monthCount = Number(monthAgg?.count ?? 0)
  const allowed = await canCreateWithinLimit(companyId, "maxInvoicesPerMonth", monthCount)
  if (!allowed) {
    return { ok: false, error: LIMIT_REACHED_MESSAGE }
  }

  const items = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, bookingId))
  const itemIds = items.map((i) => i.id)
  const opts = itemIds.length
    ? await db.select().from(bookingItemOptions).where(inArray(bookingItemOptions.bookingItemId, itemIds))
    : []

  const [settings] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.companyId, companyId))
    .limit(1)
  const vatEnabled = settings?.vatEnabled ?? false
  const vatRate = settings?.vatRate ?? "0"
  // Devise figée dès le brouillon (réutilise `settings` déjà chargé, aucune
  // requête supplémentaire) : évite tout écart devise aperçu DRAFT vs ISSUED.
  const draftCurrency = resolveDraftCurrency(settings?.billingProfileConfirmedAt != null, settings?.defaultCurrency)

  // Véhicule (snapshot niveau facture) : repris de la 1re ligne.
  const firstItem = items[0]

  // Construction des lignes snapshotées.
  const lines: {
    kind: InvoiceLineKind
    label: string
    description: string | null
    quantity: number
    unitPriceCents: number
    sortOrder: number
  }[] = []
  let sort = 0
  for (const it of items) {
    const vehicleDesc = [it.vehicleTypeName, it.vehicleBrand, it.vehicleModel]
      .filter(Boolean)
      .join(" · ")
    lines.push({
      kind: "service",
      label: it.serviceName,
      description: vehicleDesc || null,
      quantity: 1,
      unitPriceCents: it.priceCents,
      sortOrder: sort++,
    })
    for (const o of opts.filter((o) => o.bookingItemId === it.id)) {
      lines.push({
        kind: "option",
        label: o.optionName,
        description: `Option — ${it.serviceName}`,
        quantity: 1,
        unitPriceCents: o.priceCents,
        sortOrder: sort++,
      })
    }
  }
  if (booking.travelFeeCents > 0) {
    lines.push({
      kind: "travel",
      label: "Frais de déplacement",
      description: `${Number(booking.billedDistanceKm)} km`,
      quantity: 1,
      unitPriceCents: booking.travelFeeCents,
      sortOrder: sort++,
    })
  }

  const totals = computeInvoice({
    lines: lines.map((l) => ({ kind: l.kind, quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
    discountCents: 0,
    vatEnabled,
    vatRate: Number(vatRate),
    depositCents: booking.depositCents,
    paidCents: 0,
  })

  const invoiceId = await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(invoices)
      .values({
        companyId,
        bookingId,
        status: "draft",
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        customerPhone: booking.customerPhone,
        customerAddress: booking.address,
        vehicleTypeName: firstItem?.vehicleTypeName ?? null,
        vehicleBrand: firstItem?.vehicleBrand ?? null,
        vehicleModel: firstItem?.vehicleModel ?? null,
        vehiclePlate: firstItem?.vehiclePlate ?? null,
        serviceDate: booking.date,
        itemsTotalCents: totals.itemsTotalCents,
        discountCents: 0,
        netCents: totals.netCents,
        vatEnabled,
        vatRate: String(vatRate),
        vatCents: totals.vatCents,
        totalCents: totals.totalCents,
        depositCents: booking.depositCents,
        paidCents: 0,
        balanceCents: totals.balanceCents,
        currencyCode: draftCurrency,
      })
      .returning({ id: invoices.id })

    if (lines.length) {
      await tx.insert(invoiceItems).values(lines.map((l) => ({ ...l, invoiceId: inv.id })))
    }
    return inv.id
  })

  await logEvent(invoiceId, "created", `Brouillon généré depuis la réservation ${booking.reference}.`)
  revalidate()
  return { ok: true, data: { invoiceId, existed: false } }
}

/* -------------------------------------------------------------------------- */
/*  Enregistrement du brouillon (lignes + champs éditables)                   */
/* -------------------------------------------------------------------------- */

export interface SaveDraftInput {
  invoiceId: number
  discountCents: number
  vatEnabled: boolean
  vatRate: number
  // Traitement fiscal explicite (LOT 2B.4). Le serveur reste source de vérité.
  taxTreatment?: string | null
  taxLegalMention?: string | null
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  customerAddress: string | null
  // Identité client B2C/B2B (facultative). Le PAYS DU CLIENT pilote la validation.
  customerType?: string | null
  customerCountry?: string | null
  customerLegalRegistrationNumber?: string | null
  customerVatNumber?: string | null
  vehicleTypeName: string | null
  vehicleBrand: string | null
  vehicleModel: string | null
  vehiclePlate: string | null
  serviceDate: string | null
  dueDate: string | null
  customerComment: string | null
  internalNote: string | null
  lines: {
    kind: InvoiceLineKind
    label: string
    description: string | null
    quantity: number
    unitPriceCents: number
    // Avoirs uniquement : rattachement à la ligne de la facture d'origine.
    // Ignoré pour les factures classiques. Requis pour chaque ligne d'avoir.
    originalInvoiceItemId?: number | null
  }[]
}

/**
 * Enregistre les lignes d'un BROUILLON d'avoir. Contrairement à une facture,
 * l'entête d'un avoir est FIGÉE (devise, traitement TVA, mention fiscale, remise,
 * snapshots vendeur/client repris de la facture d'origine) : seules les lignes
 * sont ajustables. Le serveur ignore tout champ d'entête envoyé par le client et
 * plafonne chaque ligne à la quantité/au prix encore créditables de la ligne
 * d'origine (cumul de tous les avoirs pris en compte).
 */
async function saveCreditNoteDraftLines(
  cn: typeof invoices.$inferSelect,
  input: SaveDraftInput,
  companyId: number,
): Promise<ActionResult> {
  if (cn.originalInvoiceId == null) {
    return { ok: false, error: "Avoir non rattaché à une facture." }
  }
  const original = await loadOwnedInvoice(cn.originalInvoiceId, companyId)
  if (!original) return { ok: false, error: "Facture d'origine introuvable." }

  const originalItems = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, original.id))
  const origById = new Map(originalItems.map((o) => [o.id, o]))

  // Quantité DÉJÀ créditée par ligne d'origine (avoirs émis/payés, hors CET
  // avoir et hors brouillons/annulés), scopée entreprise.
  const siblings = await db
    .select({
      cnId: invoices.id,
      status: invoices.status,
      itemOriginalId: invoiceItems.originalInvoiceItemId,
      quantity: invoiceItems.quantity,
    })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.documentType, CREDIT_NOTE_DOCUMENT_TYPE),
        eq(invoices.originalInvoiceId, original.id),
      ),
    )
  const creditedByLine = new Map<number, number>()
  for (const r of siblings) {
    if (r.cnId === cn.id) continue
    if (r.status === "draft" || r.status === "cancelled") continue
    if (r.itemOriginalId == null) continue
    creditedByLine.set(r.itemOriginalId, (creditedByLine.get(r.itemOriginalId) ?? 0) + Math.max(0, r.quantity))
  }

  // Lignes validées + plafonnées. label/kind/description proviennent TOUJOURS de
  // la ligne d'origine (non falsifiables) ; seuls quantité et prix unitaire sont
  // ajustables, et bornés. Agrégation intra-payload pour empêcher tout
  // contournement via plusieurs lignes visant la même ligne d'origine.
  const intraUsed = new Map<number, number>()
  const cleaned: {
    invoiceId: number
    kind: InvoiceLineKind
    label: string
    description: string | null
    quantity: number
    unitPriceCents: number
    sortOrder: number
    originalInvoiceItemId: number
  }[] = []
  let sort = 0
  for (const l of input.lines) {
    const originalItemId = l.originalInvoiceItemId ?? null
    if (originalItemId == null || !origById.has(originalItemId)) {
      return { ok: false, error: "Un avoir ne peut créditer que des lignes de la facture d'origine." }
    }
    const orig = origById.get(originalItemId)!
    const alreadyCredited = (creditedByLine.get(originalItemId) ?? 0) + (intraUsed.get(originalItemId) ?? 0)
    const qty = clampCreditLineQuantity(l.quantity, orig.quantity, alreadyCredited)
    if (qty <= 0) continue
    const unitPriceCents = clampCreditUnitPrice(l.unitPriceCents, orig.unitPriceCents)
    intraUsed.set(originalItemId, (intraUsed.get(originalItemId) ?? 0) + qty)
    cleaned.push({
      invoiceId: cn.id,
      kind: orig.kind as InvoiceLineKind,
      label: orig.label,
      description: orig.description,
      quantity: qty,
      unitPriceCents,
      sortOrder: sort++,
      originalInvoiceItemId: originalItemId,
    })
  }

  await db.transaction(async (tx) => {
    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, cn.id))
    if (cleaned.length) await tx.insert(invoiceItems).values(cleaned)
    // Entête figée : seul updatedAt bouge (aucune réécriture devise/TVA/client).
    await tx.update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, cn.id))
  })

  await recalcInvoice(cn.id)
  revalidate()
  return { ok: true }
}

export async function saveInvoiceDraft(input: SaveDraftInput): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  const inv = await loadOwnedInvoice(input.invoiceId, tenant.id)
  if (!inv) return { ok: false, error: "Facture introuvable." }
  if (inv.status !== "draft") {
    return { ok: false, error: "Seul un brouillon peut être modifié." }
  }
  // Avoir : chemin dédié (entête figée, seules les lignes sont ajustables).
  if (isCreditNote(inv.documentType)) {
    return await saveCreditNoteDraftLines(inv, input, tenant.id)
  }
  if (!input.customerName.trim()) {
    return { ok: false, error: "Le nom du client est obligatoire." }
  }

  // Traitement fiscal explicite (LOT 2B.4). Le serveur normalise et reste source
  // de vérité, même si le front envoie une combinaison incohérente. Aucune
  // inférence depuis le pays / le type de client / le numéro de TVA.
  const rawTaxTreatment = input.taxTreatment?.trim().toUpperCase() || null
  let taxTreatment: TaxTreatment | null = null
  if (rawTaxTreatment) {
    if (!isTaxTreatment(rawTaxTreatment)) {
      return { ok: false, error: "Traitement TVA invalide." }
    }
    taxTreatment = rawTaxTreatment
  }
  // Mention fiscale : conservée UNIQUEMENT pour les traitements sans TVA. Jamais
  // pour STANDARD ni pour le legacy (null). Aucune mention injectée par défaut.
  const taxLegalMention =
    taxTreatment && taxTreatment !== "STANDARD" ? input.taxLegalMention?.trim() || null : null
  // Résolution mécanique de vatEnabled/vatRate depuis le traitement.
  const effectiveTax = resolveTaxCalculation({
    taxTreatment,
    legacyVatEnabled: input.vatEnabled,
    vatRate: input.vatRate,
  })

  // Identité client B2C/B2B : normalisation via le PAYS DU CLIENT (jamais le
  // vendeur). Le brouillon devient la source de vérité pour CETTE facture.
  const rawCustType = (input.customerType ?? "").trim()
  const customerType = rawCustType === "individual" || rawCustType === "business" ? rawCustType : null
  const rawCustCountry = (input.customerCountry ?? "").trim().toUpperCase()
  const customerCountry = rawCustCountry === "OTHER" ? "OTHER" : rawCustCountry || null
  let customerLegalNumber: string | null = (input.customerLegalRegistrationNumber ?? "").trim() || null
  let customerLegalScheme: string | null = null
  let customerVatNumber: string | null = (input.customerVatNumber ?? "").trim() || null
  if (customerType === "business") {
    // Un client ENTREPRISE exige un pays explicite : jamais de FR implicite.
    if (!customerCountry) {
      return { ok: false, error: "Choisissez le pays de l'entreprise cliente." }
    }
    const custProfile = getCountryProfile(customerCountry)
    const legal = custProfile.validateLegalId(customerLegalNumber)
    if (!legal.valid) return { ok: false, error: `${custProfile.customerLegalIdLabel} : ${legal.message ?? "format invalide."}` }
    const vat = custProfile.validateVatNumber(customerVatNumber)
    if (!vat.valid) return { ok: false, error: `${custProfile.vatNumberLabel} : ${vat.message ?? "format invalide."}` }
    customerLegalNumber = legal.normalized || null
    customerLegalScheme = customerLegalNumber ? (legal.scheme ?? custProfile.legalIdScheme) : null
    customerVatNumber = vat.normalized || null
  } else {
    // SEUL un client ENTREPRISE peut porter une identité professionnelle.
    // Particulier OU type inconnu/legacy => on n'enregistre JAMAIS d'identifiant
    // légal ni de TVA (évite qu'un client repassé "particulier" garde des
    // identifiants pro cachés). Aucune identité B2B inventée pour un type null.
    customerLegalNumber = null
    customerLegalScheme = null
    customerVatNumber = null
  }

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        discountCents: Math.max(0, Math.round(input.discountCents)),
        vatEnabled: effectiveTax.vatEnabled,
        vatRate: String(effectiveTax.vatRate),
        taxTreatment,
        taxLegalMention,
        customerName: input.customerName.trim(),
        customerEmail: input.customerEmail?.trim() || null,
        customerPhone: input.customerPhone?.trim() || null,
        customerAddress: input.customerAddress?.trim() || null,
        // Snapshot client posé dès le brouillon (source de vérité de la facture).
        customerType,
        customerCountry,
        customerLegalRegistrationNumber: customerLegalNumber,
        customerLegalRegistrationScheme: customerLegalScheme,
        customerVatNumber,
        vehicleTypeName: input.vehicleTypeName?.trim() || null,
        vehicleBrand: input.vehicleBrand?.trim() || null,
        vehicleModel: input.vehicleModel?.trim() || null,
        vehiclePlate: input.vehiclePlate?.trim() || null,
        serviceDate: input.serviceDate || null,
        dueDate: input.dueDate || null,
        customerComment: input.customerComment?.trim() || null,
        internalNote: input.internalNote?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, input.invoiceId))

    // On remplace toutes les lignes (approche simple et fiable).
    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, input.invoiceId))
    const cleaned = input.lines
      .filter((l) => l.label.trim().length > 0)
      .map((l, i) => ({
        invoiceId: input.invoiceId,
        kind: l.kind,
        label: l.label.trim(),
        description: l.description?.trim() || null,
        quantity: Math.max(1, Math.round(l.quantity)),
        unitPriceCents: Math.round(l.unitPriceCents),
        sortOrder: i,
      }))
    if (cleaned.length) await tx.insert(invoiceItems).values(cleaned)
  })

  await recalcInvoice(input.invoiceId)
  revalidate()
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Émission (validation définitive) : numérotation + gel                     */
/* -------------------------------------------------------------------------- */

export async function issueInvoice(invoiceId: number): Promise<ActionResult<{ number: string }>> {
  const { tenant } = await requireCompanyMember()
  const companyId = tenant.id

  const inv = await loadOwnedInvoice(invoiceId, companyId)
  if (!inv) return { ok: false, error: "Facture introuvable." }
  // Un avoir n'est JAMAIS émis par ce chemin : il possède sa propre numérotation
  // (AVO-...) et ses propres garde-fous (voir issueCreditNote). On refuse
  // explicitement pour éviter qu'un avoir reçoive un numéro de facture.
  if (isCreditNote(inv.documentType)) {
    return { ok: false, error: "Ce document est un avoir : utilisez « Émettre l'avoir »." }
  }
  if (inv.status !== "draft") return { ok: false, error: "Cette facture est déjà émise." }

  const itemsCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
  if (Number(itemsCount[0]?.n ?? 0) === 0) {
    return { ok: false, error: "Ajoutez au moins une ligne avant d'émettre la facture." }
  }

  // Traitement fiscal snapshoté sur le brouillon. La mention fiscale reste
  // OPTIONNELLE : l'émission n'est jamais bloquée pour une mention manquante et
  // DetailFlow n'invente aucune mention automatique.
  const draftTaxTreatment = normalizeTaxTreatment(inv.taxTreatment)

  // Validation minimale de l'émetteur : sans identification de l'entreprise la
  // facture n'est pas valable. On réutilise les champs déjà présents dans les
  // paramètres de facturation (mêmes que ceux snapshotés à l'émission).
  // Le brouillon est conservé tel quel si une information manque.
  const [issuer] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.companyId, companyId))
    .limit(1)
  const missing: string[] = []
  if (!issuer?.businessName?.trim()) missing.push("le nom / la raison sociale")
  if (!(issuer?.invoiceCompanyAddress?.trim() || issuer?.businessAddress?.trim())) missing.push("l'adresse")
  // Le SIRET n'est volontairement PAS bloquant : DetailFlow accueille des
  // entreprises étrangères et des bêta-testeurs dont la configuration
  // administrative n'est pas terminée. L'absence de SIRET n'empêche jamais
  // l'émission ni le paiement d'une facture ; un avertissement non bloquant
  // est affiché côté UI (voir InvoiceView) quand l'entreprise est française.
  if (missing.length) {
    return {
      ok: false,
      error: `Impossible d'émettre la facture : renseignez ${missing.join(", ")} dans les paramètres de facturation.`,
    }
  }

  // Snapshot légal vendeur figé à l'émission (logique pure/testée) : confirmé
  // requis + fallback invoiceSiret réservé au FR confirmé + devise sûre.
  const [company] = await db
    .select({ country: companiesTable.country })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1)
  const {
    issuerCountry,
    issuerLegalRegistrationNumber: issuerLegalNumber,
    issuerLegalRegistrationScheme: issuerLegalScheme,
    issuerVatNumber: issuerVatSnapshot,
    currencyCode,
  } = resolveIssuerBillingSnapshot({
    confirmed: issuer?.billingProfileConfirmedAt != null,
    companyCountry: company?.country,
    legalRegistrationNumber: issuer?.legalRegistrationNumber,
    legalRegistrationScheme: issuer?.legalRegistrationScheme,
    invoiceSiret: issuer?.invoiceSiret,
    vatNumber: issuer?.vatNumber,
    sellerDefaultCurrency: issuer?.defaultCurrency,
    invoiceCurrency: inv.currencyCode,
  })

  const year = new Date().getFullYear()

  const number = await db.transaction(async (tx) => {
    // Compteur PROPRE à l'entreprise (num��rotation isolée par tenant).
    // `FOR UPDATE` verrouille la ligne settings de CETTE entreprise pendant
    // toute la transaction : deux émissions concurrentes sont sérialisées et
    // ne peuvent donc pas obtenir le même numéro. Une autre entreprise
    // verrouille une autre ligne → aucun blocage inter-tenant. Format et
    // logique de numérotation inchangés.
    const [s] = await tx
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.companyId, companyId))
      .limit(1)
      .for("update")
    const prefix = s?.invoicePrefix || "FAC"
    // Réinitialisation du compteur au changement d'année.
    const currentYear = s?.invoiceCounterYear ?? 0
    const nextCounter = currentYear === year ? (s?.invoiceCounter ?? 0) + 1 : 1
    const dueDays = s?.invoiceDueDays ?? 30

    await tx
      .update(settingsTable)
      .set({ invoiceCounter: nextCounter, invoiceCounterYear: year, updatedAt: new Date() })
      .where(eq(settingsTable.companyId, companyId))

    const num = `${prefix}-${year}-${String(nextCounter).padStart(4, "0")}`

    const issueDate = new Date().toISOString().slice(0, 10)
    const due = new Date()
    due.setDate(due.getDate() + dueDays)
    const dueDate = due.toISOString().slice(0, 10)

    // Snapshot émetteur : la facture ne bougera plus si les paramètres changent.
    await tx
      .update(invoices)
      .set({
        number: num,
        status: "issued",
        issueDate,
        dueDate: inv.dueDate ?? dueDate,
        issuerName: s?.businessName ?? null,
        issuerEmail: s?.businessEmail ?? null,
        issuerPhone: s?.businessPhone ?? null,
        issuerAddress: s?.invoiceCompanyAddress ?? s?.businessAddress ?? null,
        issuerSiret: s?.invoiceSiret ?? null,
        issuerIban: s?.invoiceIban ?? null,
        issuerBic: s?.invoiceBic ?? null,
        // Snapshot multi-pays figé (indépendant des paramètres actuels ensuite).
        issuerCountry,
        issuerLegalRegistrationNumber: issuerLegalNumber,
        issuerLegalRegistrationScheme: issuerLegalScheme,
        issuerVatNumber: issuerVatSnapshot,
        currencyCode,
        issuerLogoPathname: s?.invoiceLogoPathname ?? null,
        // Fallback historique : le texte d'exonération des settings n'est copié
        // QUE pour les factures legacy (taxTreatment null) sans TVA. Avec le
        // nouveau modèle (taxTreatment non-null), la mention vient exclusivement
        // de taxLegalMention (déjà figée sur le brouillon) : on n'injecte JAMAIS
        // l'ancien texte FR sur une facture EXEMPT/REVERSE_CHARGE/OUT_OF_SCOPE.
        vatExemptNote: draftTaxTreatment == null && !inv.vatEnabled ? (s?.vatExemptNote ?? null) : null,
        footerNote: s?.invoiceFooterNote ?? null,
        legalMentions: s?.invoiceLegalMentions ?? null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))

    return num
  })

  await logEvent(invoiceId, "issued", `Facture émise sous le numéro ${number}.`)
  revalidate()
  return { ok: true, data: { number } }
}

/* -------------------------------------------------------------------------- */
/*  Paiements                                                                 */
/* -------------------------------------------------------------------------- */

export async function addInvoicePayment(input: {
  invoiceId: number
  amountCents: number
  method: string
  paidAt: string
  note?: string | null
}): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  const inv = await loadOwnedInvoice(input.invoiceId, tenant.id)
  if (!inv) return { ok: false, error: "Facture introuvable." }
  // Un avoir ne se paie pas : il rembourse/annule un montant, il ne reçoit
  // jamais de règlement. Blocage serveur (l'UI masque aussi le paiement).
  if (isCreditNote(inv.documentType)) {
    return { ok: false, error: "Un avoir ne peut pas recevoir de paiement." }
  }
  if (inv.status === "draft") return { ok: false, error: "Émettez la facture avant d'enregistrer un paiement." }
  if (inv.status === "cancelled") return { ok: false, error: "Facture annulée." }
  if (input.amountCents <= 0) return { ok: false, error: "Le montant doit être positif." }

  await db.insert(invoicePayments).values({
    invoiceId: input.invoiceId,
    amountCents: Math.round(input.amountCents),
    method: input.method,
    paidAt: input.paidAt,
    note: input.note?.trim() || null,
  })
  await logEvent(input.invoiceId, "payment_added", `Paiement enregistré.`)

  const result = await recalcInvoice(input.invoiceId)
  // Passage automatique en "payée" si soldée.
  if (result && result.balanceCents === 0) {
    await db.update(invoices).set({ status: "paid", updatedAt: new Date() }).where(eq(invoices.id, input.invoiceId))
    await logEvent(input.invoiceId, "updated", "Facture soldée : passée au statut « Payée ».")
  }
  revalidate()
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Annulation / suppression de brouillon                                     */
/* -------------------------------------------------------------------------- */

export async function cancelInvoice(invoiceId: number): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  const inv = await loadOwnedInvoice(invoiceId, tenant.id)
  if (!inv) return { ok: false, error: "Facture introuvable." }
  // Une facture émise ou payée est un document figé : elle ne peut plus être
  // annulée comme un brouillon. La rectification passe par un avoir (hors
  // périmètre ici). Les brouillons restent annulables comme avant, et les
  // factures déjà « cancelled » ne sont pas impactées (affichage préservé).
  if (inv.status === "issued" || inv.status === "paid") {
    return {
      ok: false,
      error: "Une facture émise ne peut pas être annulée directement : elle doit être rectifiée par un avoir.",
    }
  }
  await db.update(invoices).set({ status: "cancelled", updatedAt: new Date() }).where(eq(invoices.id, invoiceId))
  await logEvent(invoiceId, "cancelled", "Facture annulée.")
  revalidate()
  return { ok: true }
}

export async function deleteDraftInvoice(invoiceId: number): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  const inv = await loadOwnedInvoice(invoiceId, tenant.id)
  if (!inv) return { ok: false, error: "Facture introuvable." }
  if (inv.status !== "draft") return { ok: false, error: "Seul un brouillon peut être supprimé." }
  await db.transaction(async (tx) => {
    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId))
    await tx.delete(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoiceId))
    await tx.delete(invoices).where(eq(invoices.id, invoiceId))
  })
  revalidate()
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Avoirs (notes de crédit) — rectification d'une facture émise              */
/* -------------------------------------------------------------------------- */

/**
 * Crée un BROUILLON d'avoir rectifiant une facture émise/payée. L'avoir reprend
 * les informations FIGÉES de la facture d'origine (client, véhicule, devise,
 * traitement TVA, identité vendeur) et référence son numéro/date. Il démarre en
 * brouillon : ses lignes restent modifiables (avoir partiel) jusqu'à l'émission.
 *
 * Garde-fous serveur (companyId résolu côté serveur, jamais depuis le client) :
 *  - facture d'origine appartenant à l'entreprise (sinon introuvable) ;
 *  - avoir impossible sur un brouillon (uniquement émise/payée) ;
 *  - avoir impossible depuis un autre avoir ;
 *  - motif obligatoire ;
 *  - facture déjà intégralement créditée => refus.
 * La facture d'origine n'est JAMAIS modifiée.
 *
 * mode "full"  => reprend toutes les lignes de la facture d'origine.
 * mode "partial" => reprend aussi toutes les lignes, à ajuster dans le brouillon.
 */
export async function createCreditNote(
  originalInvoiceId: number,
  mode: "full" | "partial",
  reason: string,
): Promise<ActionResult<{ invoiceId: number }>> {
  const { tenant } = await requireCompanyMember()
  const companyId = tenant.id

  const original = await loadOwnedInvoice(originalInvoiceId, companyId)
  if (!original) return { ok: false, error: "Facture introuvable." }
  if (isCreditNote(original.documentType)) {
    return { ok: false, error: "Un avoir ne peut pas être créé depuis un autre avoir." }
  }
  if (!CREDITABLE_INVOICE_STATUSES.includes(original.status as (typeof CREDITABLE_INVOICE_STATUSES)[number])) {
    return { ok: false, error: "Un avoir ne peut être créé que depuis une facture émise." }
  }
  const reasonCheck = validateCreditReason(reason)
  if (!reasonCheck.ok) return { ok: false, error: reasonCheck.error }

  // Plafond : refuse un nouvel avoir si la facture est déjà intégralement créditée.
  const { getIssuedCreditTotalCents } = await import("@/lib/invoice/queries")
  const alreadyIssued = await getIssuedCreditTotalCents(originalInvoiceId, companyId)
  if (alreadyIssued >= original.totalCents) {
    return { ok: false, error: "Cette facture est déjà intégralement créditée." }
  }

  const originalItems = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, originalInvoiceId))
    .orderBy(invoiceItems.sortOrder)

  // Quantité DÉJÀ créditée par ligne (avoirs émis attribués via
  // originalInvoiceItemId). Le brouillon ne reprend que le RESTE créditable :
  // gère correctement « avoir intégral » créé après un premier avoir partiel.
  const priorCredits = await db
    .select({
      status: invoices.status,
      itemOriginalId: invoiceItems.originalInvoiceItemId,
      quantity: invoiceItems.quantity,
    })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.documentType, CREDIT_NOTE_DOCUMENT_TYPE),
        eq(invoices.originalInvoiceId, originalInvoiceId),
      ),
    )
  const creditedByLine = new Map<number, number>()
  for (const r of priorCredits) {
    if (r.status === "draft" || r.status === "cancelled") continue
    if (r.itemOriginalId == null) continue
    creditedByLine.set(r.itemOriginalId, (creditedByLine.get(r.itemOriginalId) ?? 0) + Math.max(0, r.quantity))
  }
  const creditLines = originalItems
    .map((l) => ({ src: l, qty: remainingLineQuantity(l.quantity, creditedByLine.get(l.id) ?? 0) }))
    .filter((x) => x.qty > 0)
  if (creditLines.length === 0) {
    return { ok: false, error: "Cette facture est déjà intégralement créditée." }
  }

  const invoiceId = await db.transaction(async (tx) => {
    const [cn] = await tx
      .insert(invoices)
      .values({
        companyId,
        // Un avoir n'est jamais rattaché à une réservation (évite la contrainte
        // unique bookingId ; l'avoir référence la facture, pas la réservation).
        bookingId: null,
        status: "draft",
        documentType: CREDIT_NOTE_DOCUMENT_TYPE,
        originalInvoiceId,
        creditReason: reasonCheck.reason,
        // Snapshot client figé, repris de la facture d'origine.
        customerName: original.customerName,
        customerEmail: original.customerEmail,
        customerPhone: original.customerPhone,
        customerAddress: original.customerAddress,
        customerType: original.customerType,
        customerCountry: original.customerCountry,
        customerLegalRegistrationNumber: original.customerLegalRegistrationNumber,
        customerLegalRegistrationScheme: original.customerLegalRegistrationScheme,
        customerVatNumber: original.customerVatNumber,
        // Snapshot véhicule.
        vehicleTypeName: original.vehicleTypeName,
        vehicleBrand: original.vehicleBrand,
        vehicleModel: original.vehicleModel,
        vehiclePlate: original.vehiclePlate,
        serviceDate: original.serviceDate,
        // Même devise + même traitement TVA que la facture d'origine.
        currencyCode: original.currencyCode,
        vatEnabled: original.vatEnabled,
        vatRate: original.vatRate,
        taxTreatment: original.taxTreatment,
        taxLegalMention: original.taxLegalMention,
        discountCents: original.discountCents,
        depositCents: 0,
        // Snapshot émetteur repris tel quel (identité vendeur figée = celle de
        // la facture d'origine ; l'émission de l'avoir ne le réécrit pas).
        issuerName: original.issuerName,
        issuerEmail: original.issuerEmail,
        issuerPhone: original.issuerPhone,
        issuerAddress: original.issuerAddress,
        issuerSiret: original.issuerSiret,
        issuerIban: original.issuerIban,
        issuerBic: original.issuerBic,
        issuerCountry: original.issuerCountry,
        issuerLegalRegistrationNumber: original.issuerLegalRegistrationNumber,
        issuerLegalRegistrationScheme: original.issuerLegalRegistrationScheme,
        issuerVatNumber: original.issuerVatNumber,
        issuerLogoPathname: original.issuerLogoPathname,
        vatExemptNote: original.vatExemptNote,
        footerNote: original.footerNote,
        legalMentions: original.legalMentions,
      })
      .returning({ id: invoices.id })

    if (creditLines.length) {
      await tx.insert(invoiceItems).values(
        creditLines.map((x, i) => ({
          invoiceId: cn.id,
          kind: x.src.kind,
          label: x.src.label,
          description: x.src.description,
          // Reste créditable de la ligne (jamais plus que la quantité facturée).
          quantity: x.qty,
          unitPriceCents: x.src.unitPriceCents,
          sortOrder: i,
          // Rattachement à la ligne d'origine (plafonnement serveur ultérieur).
          originalInvoiceItemId: x.src.id,
        })),
      )
    }
    return cn.id
  })

  await recalcInvoice(invoiceId)
  await logEvent(
    invoiceId,
    "created",
    `Brouillon d'avoir (${mode === "full" ? "intégral" : "partiel"}) créé pour la facture ${original.number ?? originalInvoiceId}.`,
  )
  revalidate()
  return { ok: true, data: { invoiceId } }
}

/**
 * Émet un avoir : numérotation INDÉPENDANTE (AVO-AAAA-NNNN), gel définitif.
 * Dans une seule transaction, verrouille la facture d'origine ET la ligne
 * settings (FOR UPDATE) : deux émissions concurrentes sont sérialisées et ne
 * peuvent jamais faire dépasser le cumul des avoirs au-delà du total d'origine.
 */
export async function issueCreditNote(creditNoteId: number): Promise<ActionResult<{ number: string }>> {
  const { tenant } = await requireCompanyMember()
  const companyId = tenant.id

  const cn = await loadOwnedInvoice(creditNoteId, companyId)
  if (!cn) return { ok: false, error: "Avoir introuvable." }
  if (!isCreditNote(cn.documentType)) return { ok: false, error: "Ce document n'est pas un avoir." }
  if (cn.status !== "draft") return { ok: false, error: "Cet avoir est déjà émis." }
  if (cn.originalInvoiceId == null) return { ok: false, error: "Avoir non rattaché à une facture." }

  const year = new Date().getFullYear()
  const originalInvoiceId = cn.originalInvoiceId

  const result = await db.transaction(async (tx) => {
    // Verrou + relecture de l'AVOIR lui-même : deux émissions concurrentes du
    // même avoir sont sérialisées ; la seconde le verra déjà « issued » et sera
    // refusée. Aucune double émission possible.
    const [cnLocked] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, creditNoteId), eq(invoices.companyId, companyId)))
      .limit(1)
      .for("update")
    if (!cnLocked) return { ok: false as const, error: "Avoir introuvable." }
    if (!isCreditNote(cnLocked.documentType)) return { ok: false as const, error: "Ce document n'est pas un avoir." }
    if (cnLocked.status !== "draft") return { ok: false as const, error: "Cet avoir est déjà émis." }
    if (cnLocked.originalInvoiceId == null) return { ok: false as const, error: "Avoir non rattaché à une facture." }

    // Verrou de la facture d'origine (sérialise vis-à-vis des autres avoirs).
    const [original] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, cnLocked.originalInvoiceId), eq(invoices.companyId, companyId)))
      .limit(1)
      .for("update")
    if (!original) return { ok: false as const, error: "Facture d'origine introuvable." }

    // Recalcul des totaux de l'avoir DANS la transaction, depuis ses lignes
    // courantes (source de vérité au moment de l'émission).
    const lines = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, creditNoteId))
    if (lines.length === 0) return { ok: false as const, error: "Ajoutez au moins une ligne avant d'émettre l'avoir." }
    const effectiveTax = resolveTaxCalculation({
      taxTreatment: normalizeTaxTreatment(cnLocked.taxTreatment),
      legacyVatEnabled: cnLocked.vatEnabled,
      vatRate: Number(cnLocked.vatRate),
    })
    const totals = computeInvoice({
      lines: lines.map((l) => ({ kind: l.kind as InvoiceLineKind, quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
      discountCents: cnLocked.discountCents,
      vatEnabled: effectiveTax.vatEnabled,
      vatRate: effectiveTax.vatRate,
      depositCents: 0,
      paidCents: 0,
    })
    const creditTotalCents = totals.totalCents

    // Cumul des avoirs DÉJÀ émis (hors celui-ci), calculé sous verrou.
    const others = await tx
      .select({ id: invoices.id, status: invoices.status, totalCents: invoices.totalCents })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          eq(invoices.documentType, CREDIT_NOTE_DOCUMENT_TYPE),
          eq(invoices.originalInvoiceId, original.id),
        ),
      )
    const alreadyIssued = others
      .filter((r) => r.id !== creditNoteId && r.status !== "draft" && r.status !== "cancelled")
      .reduce((sum, r) => sum + Math.max(0, r.totalCents), 0)

    const guard = canIssueCredit(original.totalCents, alreadyIssued, creditTotalCents)
    if (!guard.ok) return { ok: false as const, error: guard.error }

    // Compteur d'avoirs PROPRE à l'entreprise, verrouillé FOR UPDATE.
    const [s] = await tx.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1).for("update")
    const prefix = s?.creditNotePrefix || "AVO"
    const currentYear = s?.creditNoteCounterYear ?? 0
    const nextCounter = currentYear === year ? (s?.creditNoteCounter ?? 0) + 1 : 1
    await tx
      .update(settingsTable)
      .set({ creditNoteCounter: nextCounter, creditNoteCounterYear: year, updatedAt: new Date() })
      .where(eq(settingsTable.companyId, companyId))

    const num = `${prefix}-${year}-${String(nextCounter).padStart(4, "0")}`
    const issueDate = new Date().toISOString().slice(0, 10)

    // Totaux figés + statut. Un avoir ne « reste » jamais à régler : balance 0.
    await tx
      .update(invoices)
      .set({
        number: num,
        status: "issued",
        issueDate,
        itemsTotalCents: totals.itemsTotalCents,
        netCents: totals.netCents,
        vatCents: totals.vatCents,
        totalCents: totals.totalCents,
        paidCents: 0,
        balanceCents: 0,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, creditNoteId))

    return { ok: true as const, number: num, creditTotalCents, currencyCode: cnLocked.currencyCode }
  })

  if (!result.ok) return { ok: false, error: result.error }

  await logEvent(creditNoteId, "issued", `Avoir émis sous le numéro ${result.number}.`)
  // Traçabilité : événement sur la facture d'origine (jamais modifiée par ailleurs).
  if (originalInvoiceId != null) {
    await logEvent(
      originalInvoiceId,
      "credit_note_issued",
      `Avoir ${result.number} émis (${formatMoney(result.creditTotalCents, result.currencyCode)}) sur cette facture.`,
    )
  }
  revalidate()
  return { ok: true, data: { number: result.number } }
}

/* -------------------------------------------------------------------------- */
/*  Envoi par email (avec PDF en pièce jointe)                                */
/* -------------------------------------------------------------------------- */

export async function sendInvoiceEmail(invoiceId: number): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  const companyId = tenant.id

  const inv = await loadOwnedInvoice(invoiceId, companyId)
  if (!inv) return { ok: false, error: "Facture introuvable." }
  if (inv.status === "draft") {
    return { ok: false, error: isCreditNote(inv.documentType) ? "Émettez l'avoir avant de l'envoyer." : "Émettez la facture avant de l'envoyer." }
  }
  if (!inv.customerEmail) return { ok: false, error: "Aucune adresse email client sur ce document." }

  const isCredit = isCreditNote(inv.documentType)

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(invoiceItems.sortOrder)

  // Référence de la facture d'origine (avoirs uniquement) : conserve son numéro
  // et sa date sur le PDF et dans l'email.
  let originalRef: { number: string | null; issueDate: string | null } | null = null
  if (isCredit && inv.originalInvoiceId != null) {
    const orig = await loadOwnedInvoice(inv.originalInvoiceId, companyId)
    if (orig) originalRef = { number: orig.number, issueDate: orig.issueDate }
  }

  const [s] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.companyId, companyId))
    .limit(1)
  const businessName = inv.issuerName || s?.businessName || tenant.name || "DetailFlow"

  // Génération du PDF (import différé : dépendances Node-only).
  const { renderInvoicePdf } = await import("@/lib/invoice/pdf")
  const { getLogoDataUrl } = await import("@/lib/invoice/logo")
  const { invoiceEmail } = await import("@/lib/email/templates")
  const { sendEmail } = await import("@/lib/email/send")

  const logoDataUrl = await getLogoDataUrl(inv.issuerLogoPathname)
  const pdf = await renderInvoicePdf({ invoice: inv, items, logoDataUrl, originalRef })

  const { subject, html } = invoiceEmail({
    customerName: inv.customerName,
    invoiceNumber: inv.number || (isCredit ? `Avoir ${invoiceId}` : `Facture ${invoiceId}`),
    totalCents: inv.totalCents,
    balanceCents: inv.balanceCents,
    currencyCode: inv.currencyCode,
    dueDate: inv.dueDate,
    businessName,
    businessEmail: inv.issuerEmail || s?.businessEmail,
    businessPhone: inv.issuerPhone || s?.businessPhone,
    // Un avoir ne réutilise jamais le corps d'email personnalisé « facture ».
    customBody: isCredit ? null : s?.invoiceEmailBody,
    isCreditNote: isCredit,
    originalRef,
  })

  // Pour un avoir, le nom du fichier reste le numéro AVO-... (jamais FAC-...).
  const attachmentName = `${inv.number || (isCredit ? `avoir-${invoiceId}` : `facture-${invoiceId}`)}.pdf`

  const res = await sendEmail({
    to: inv.customerEmail,
    // Un avoir n'hérite jamais du sujet d'email « facture » configuré en paramètres.
    subject: isCredit ? subject : s?.invoiceEmailSubject?.trim() || subject,
    html,
    fromName: businessName,
    replyTo: inv.issuerEmail || s?.businessEmail || undefined,
    attachments: [{ filename: attachmentName, content: pdf }],
  })

  if (!res.ok) {
    return { ok: false, error: res.error || "Échec de l'envoi de l'email." }
  }

  await logEvent(
    invoiceId,
    "email_sent",
    `${isCredit ? "Avoir" : "Facture"} envoyé${isCredit ? "" : "e"} par email à ${inv.customerEmail}.`,
  )
  revalidate()
  return { ok: true }
}
