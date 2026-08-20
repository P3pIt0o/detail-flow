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
import { canCreateWithinLimit, LIMIT_REACHED_MESSAGE } from "@/lib/licensing/enforce"
import { getCountryProfile } from "@/lib/billing/country-profiles"

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

  const result = computeInvoice({
    lines: lines.map((l) => ({
      kind: l.kind as InvoiceLineKind,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
    })),
    discountCents: inv.discountCents,
    vatEnabled: inv.vatEnabled,
    vatRate: Number(inv.vatRate),
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
    .where(and(eq(invoices.companyId, companyId), gte(invoices.createdAt, monthStart)))
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
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  customerAddress: string | null
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
  }[]
}

export async function saveInvoiceDraft(input: SaveDraftInput): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()

  const inv = await loadOwnedInvoice(input.invoiceId, tenant.id)
  if (!inv) return { ok: false, error: "Facture introuvable." }
  if (inv.status !== "draft") {
    return { ok: false, error: "Seul un brouillon peut être modifié." }
  }
  if (!input.customerName.trim()) {
    return { ok: false, error: "Le nom du client est obligatoire." }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        discountCents: Math.max(0, Math.round(input.discountCents)),
        vatEnabled: input.vatEnabled,
        vatRate: String(input.vatRate),
        customerName: input.customerName.trim(),
        customerEmail: input.customerEmail?.trim() || null,
        customerPhone: input.customerPhone?.trim() || null,
        customerAddress: input.customerAddress?.trim() || null,
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
  if (inv.status !== "draft") return { ok: false, error: "Cette facture est déjà émise." }

  const itemsCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
  if (Number(itemsCount[0]?.n ?? 0) === 0) {
    return { ok: false, error: "Ajoutez au moins une ligne avant d'émettre la facture." }
  }

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

  // Pays vendeur (source de vérité : companies.country). Sert au snapshot
  // multi-pays figé à l'émission (identifiant légal générique + devise).
  const [company] = await db
    .select({ country: companiesTable.country })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1)
  const issuerCountry = company?.country ?? "FR"
  const profile = getCountryProfile(issuerCountry)
  // Identifiant légal générique : nouveau champ prioritaire, fallback SIRET
  // historique (rétrocompat FR). Scheme dérivé du profil si non renseigné.
  const issuerLegalNumber = issuer?.legalRegistrationNumber?.trim() || issuer?.invoiceSiret?.trim() || null
  const issuerLegalScheme =
    issuer?.legalRegistrationScheme?.trim() ||
    (issuerLegalNumber ? (profile.validateLegalId(issuerLegalNumber).scheme ?? profile.legalIdScheme) : null)
  // Devise : jamais `companies.currency` legacy (default EUR non confirmé).
  // Priorité : devise déjà posée sur la facture > devise CONFIRMÉE du vendeur
  // (settings.defaultCurrency) > suggestion dérivée du pays vendeur.
  const currencyCode = inv.currencyCode ?? issuer?.defaultCurrency ?? profile.defaultCurrency

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
        issuerVatNumber: s?.vatNumber ?? null,
        currencyCode,
        issuerLogoPathname: s?.invoiceLogoPathname ?? null,
        vatExemptNote: inv.vatEnabled ? null : (s?.vatExemptNote ?? null),
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
/*  Envoi par email (avec PDF en pièce jointe)                                */
/* -------------------------------------------------------------------------- */

export async function sendInvoiceEmail(invoiceId: number): Promise<ActionResult> {
  const { tenant } = await requireCompanyMember()
  const companyId = tenant.id

  const inv = await loadOwnedInvoice(invoiceId, companyId)
  if (!inv) return { ok: false, error: "Facture introuvable." }
  if (inv.status === "draft") return { ok: false, error: "Émettez la facture avant de l'envoyer." }
  if (!inv.customerEmail) return { ok: false, error: "Aucune adresse email client sur cette facture." }

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(invoiceItems.sortOrder)

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
  const pdf = await renderInvoicePdf({ invoice: inv, items, logoDataUrl })

  const { subject, html } = invoiceEmail({
    customerName: inv.customerName,
    invoiceNumber: inv.number || `Facture ${invoiceId}`,
    totalCents: inv.totalCents,
    balanceCents: inv.balanceCents,
    dueDate: inv.dueDate,
    businessName,
    businessEmail: inv.issuerEmail || s?.businessEmail,
    businessPhone: inv.issuerPhone || s?.businessPhone,
    customBody: s?.invoiceEmailBody,
  })

  const res = await sendEmail({
    to: inv.customerEmail,
    subject: s?.invoiceEmailSubject?.trim() || subject,
    html,
    fromName: businessName,
    replyTo: inv.issuerEmail || s?.businessEmail || undefined,
    attachments: [{ filename: `${inv.number || `facture-${invoiceId}`}.pdf`, content: pdf }],
  })

  if (!res.ok) {
    return { ok: false, error: res.error || "Échec de l'envoi de l'email." }
  }

  await logEvent(invoiceId, "email_sent", `Facture envoyée par email à ${inv.customerEmail}.`)
  revalidate()
  return { ok: true }
}
