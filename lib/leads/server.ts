/**
 * CRM PROSPECTS (leads) — COUCHE SERVEUR (accès base + synchronisations).
 *
 * Toutes les fonctions sont STRICTEMENT scopées par `companyId` (jamais de
 * lecture/écriture cross-tenant). L'identité (email/téléphone) est TOUJOURS
 * normalisée côté serveur via `lib/admin/client-crm` — jamais de confiance dans
 * les valeurs normalisées envoyées par le navigateur.
 *
 * Points clés :
 *  - `upsertLeadFromExternalSource` : helper GÉNÉRIQUE, idempotent et
 *    tenant-scoped, utilisé aujourd'hui pour CUSTOM_REQUEST et prêt pour META
 *    (Lead Ads) sans refonte. Idempotence garantie par
 *    UNIQUE(companyId, source, sourceExternalId).
 *  - Les synchronisations AUTOMATIQUES ne font jamais RÉGRESSER un prospect
 *    (voir `advanceLeadStatus` dans lib/leads/model).
 *  - Les erreurs CRM sont ISOLÉES : une panne de synchro ne doit jamais casser
 *    une demande, un paiement ou une réservation (voir `safeSync*`).
 *  - Logs : jamais d'email/téléphone/note en clair — uniquement des identifiants
 *    techniques (companyId, leadId).
 */

import { and, desc, eq, ilike, inArray, isNotNull, lte, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { leadActivities, leads } from "@/lib/db/schema"
import { normalizeEmail, normalizePhone, classifyMatch } from "@/lib/admin/client-crm"
import {
  advanceLeadStatus,
  nextStatusFromBooking,
  nextStatusFromCustomRequest,
  toValidDate,
  type LeadActivityType,
  type LeadSource,
  type LeadStatus,
} from "@/lib/leads/model"

/* ----------------------------- Types publics ---------------------------- */

export type LeadRow = typeof leads.$inferSelect
export type LeadActivityRow = typeof leadActivities.$inferSelect

/** Client transactionnel Drizzle (ou le client racine). */
/** Accepte le client global OU un handle de transaction Drizzle. */
type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/* ------------------- Tolérance « migration non appliquée » ---------------- */

/**
 * Code d'erreur PostgreSQL « relation inexistante » : les tables `leads` /
 * `lead_activities` n'existent pas encore (migration additive non appliquée sur
 * cet environnement). Ce module doit rester TOLÉRANT à cet état transitoire pour
 * ne jamais casser les flux existants (demandes, réservations, paiements) ni la
 * page admin.
 */
export function isMissingRelationError(err: unknown): boolean {
  // Drizzle encapsule l'erreur PostgreSQL native dans une chaîne `cause`
  // (parfois sur plusieurs niveaux, ex. DrizzleQueryError → cause). On parcourt
  // cette chaîne (max 5 niveaux) en se prémunissant des cycles.
  const seen = new Set<unknown>()
  let current: unknown = err

  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== "object" || seen.has(current)) return false

    seen.add(current)

    if ((current as { code?: unknown }).code === "42P01") {
      return true
    }

    current = (current as { cause?: unknown }).cause
  }

  return false
}

/**
 * Levée par les LECTURES CRM quand le schéma n'est pas encore présent. Les pages
 * admin l'interceptent pour afficher un état « en cours d'initialisation »
 * plutôt qu'une erreur 500. Ne transporte aucune PII.
 */
export class LeadsSchemaNotReadyError extends Error {
  constructor() {
    super("leads_schema_not_ready")
    this.name = "LeadsSchemaNotReadyError"
  }
}

/** Vrai si l'erreur signale un schéma CRM pas encore initialisé. */
export function isLeadsSchemaNotReady(err: unknown): err is LeadsSchemaNotReadyError {
  return err instanceof LeadsSchemaNotReadyError
}

/**
 * Enveloppe une LECTURE CRM : convertit « table absente » en
 * `LeadsSchemaNotReadyError` (état propre à afficher), laisse remonter le reste.
 */
async function leadRead<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (isMissingRelationError(err)) throw new LeadsSchemaNotReadyError()
    throw err
  }
}

/** Contact brut d'une source externe (jamais pré-normalisé de confiance). */
export interface ExternalContact {
  name?: string | null
  email?: string | null
  phone?: string | null
  vehicleType?: string | null
  vehicleBrand?: string | null
  vehicleModel?: string | null
  vehiclePlate?: string | null
  serviceInterest?: string | null
  internalSummary?: string | null
}

/** Attribution d'une source externe (préparation Meta / formulaires / imports). */
export interface ExternalAttribution {
  sourceChannel?: string | null
  campaignExternalId?: string | null
  campaignName?: string | null
  formExternalId?: string | null
  adExternalId?: string | null
  /** PETITES métadonnées d'attribution uniquement (jamais token/secret/payload brut). */
  sourceMetadata?: Record<string, unknown> | null
}

export interface UpsertExternalArgs {
  companyId: number
  source: LeadSource
  /** Identifiant externe stable (ID custom_request, Meta Lead ID…). Requis pour l'idempotence. */
  sourceExternalId: string
  contact: ExternalContact
  attribution?: ExternalAttribution
  /** Statut CRM entrant proposé par la source (passé par `advanceLeadStatus`). */
  incomingStatus?: LeadStatus
  /** Réservation liée éventuelle. */
  linkedBookingId?: number | null
  /** Utilisateur à l'origine (identifiant technique) — nul pour les synchros système. */
  actorUserId?: string | null
}

/* ------------------------------ Utilitaires ------------------------------ */

function cleanStr(v: string | null | undefined): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t.length ? t : null
}

/** Journalise une activité (dans une transaction si fournie). */
async function logActivity(
  client: DbClient,
  input: {
    companyId: number
    leadId: number
    type: LeadActivityType
    message?: string | null
    metadata?: Record<string, unknown> | null
    createdByUserId?: string | null
  },
): Promise<void> {
  await client.insert(leadActivities).values({
    companyId: input.companyId,
    leadId: input.leadId,
    type: input.type,
    message: cleanStr(input.message),
    metadata: input.metadata ?? null,
    createdByUserId: input.createdByUserId ?? null,
  })
}

/** Positionne les jalons temporels du cycle de vie selon le nouveau statut. */
function lifecycleTimestamps(status: LeadStatus, now: Date): Partial<LeadRow> {
  const patch: Partial<LeadRow> = {}
  if (status === "CONTACTED") patch.contactedAt = now
  if (status === "APPOINTMENT_BOOKED") patch.appointmentBookedAt = now
  if (status === "CLIENT") patch.convertedAt = now
  if (status === "LOST") patch.lostAt = now
  return patch
}

/* -------------------- Helper générique source externe -------------------- */

/**
 * Crée ou met à jour un prospect à partir d'une SOURCE EXTERNE identifiée.
 * IDEMPOTENT : la contrainte UNIQUE(companyId, source, sourceExternalId)
 * garantit qu'une même donnée (même reçue deux fois) ne crée jamais deux
 * prospects. Utilisé pour CUSTOM_REQUEST aujourd'hui, prêt pour META demain.
 *
 * Ne fait jamais régresser le statut (via `advanceLeadStatus`). Tenant-scoped.
 */
export async function upsertLeadFromExternalSource(args: UpsertExternalArgs): Promise<LeadRow> {
  const {
    companyId,
    source,
    sourceExternalId,
    contact,
    attribution,
    incomingStatus = "NEW",
    linkedBookingId = null,
    actorUserId = null,
  } = args

  const emailNormalized = normalizeEmail(contact.email)
  const phoneNormalized = normalizePhone(contact.phone)
  const now = new Date()

  return db.transaction(async (tx) => {
    // Recherche idempotente par (companyId, source, sourceExternalId).
    const [existing] = await tx
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.companyId, companyId),
          eq(leads.source, source),
          eq(leads.sourceExternalId, sourceExternalId),
        ),
      )
      .limit(1)

    if (existing) {
      const nextStatus = advanceLeadStatus(existing.status as LeadStatus, incomingStatus)
      const statusChanged = nextStatus !== (existing.status as LeadStatus)
      const patch: Partial<LeadRow> = {
        updatedAt: now,
        // Complète les champs manquants sans écraser une saisie manuelle existante.
        contactName: existing.contactName || cleanStr(contact.name) || existing.contactName,
        email: existing.email ?? cleanStr(contact.email),
        emailNormalized: existing.emailNormalized ?? emailNormalized,
        phone: existing.phone ?? cleanStr(contact.phone),
        phoneNormalized: existing.phoneNormalized ?? phoneNormalized,
        vehicleType: existing.vehicleType ?? cleanStr(contact.vehicleType),
        vehicleBrand: existing.vehicleBrand ?? cleanStr(contact.vehicleBrand),
        vehicleModel: existing.vehicleModel ?? cleanStr(contact.vehicleModel),
        vehiclePlate: existing.vehiclePlate ?? cleanStr(contact.vehiclePlate),
        serviceInterest: existing.serviceInterest ?? cleanStr(contact.serviceInterest),
        linkedBookingId: existing.linkedBookingId ?? linkedBookingId,
      }
      if (statusChanged) {
        patch.status = nextStatus
        Object.assign(patch, lifecycleTimestamps(nextStatus, now))
      }
      const [updated] = await tx
        .update(leads)
        .set(patch)
        .where(and(eq(leads.id, existing.id), eq(leads.companyId, companyId)))
        .returning()

      if (statusChanged) {
        await logActivity(tx, {
          companyId,
          leadId: existing.id,
          type: "SOURCE_SYNCED",
          metadata: { from: existing.status, to: nextStatus, source },
          createdByUserId: actorUserId,
        })
      }
      return updated
    }

    // Création.
    const [created] = await tx
      .insert(leads)
      .values({
        companyId,
        source,
        sourceExternalId,
        status: incomingStatus,
        contactName: cleanStr(contact.name) ?? "Prospect",
        email: cleanStr(contact.email),
        emailNormalized,
        phone: cleanStr(contact.phone),
        phoneNormalized,
        vehicleType: cleanStr(contact.vehicleType),
        vehicleBrand: cleanStr(contact.vehicleBrand),
        vehicleModel: cleanStr(contact.vehicleModel),
        vehiclePlate: cleanStr(contact.vehiclePlate),
        serviceInterest: cleanStr(contact.serviceInterest),
        internalSummary: cleanStr(contact.internalSummary),
        linkedBookingId,
        sourceChannel: cleanStr(attribution?.sourceChannel),
        campaignExternalId: cleanStr(attribution?.campaignExternalId),
        campaignName: cleanStr(attribution?.campaignName),
        formExternalId: cleanStr(attribution?.formExternalId),
        adExternalId: cleanStr(attribution?.adExternalId),
        sourceMetadata: attribution?.sourceMetadata ?? null,
        ...lifecycleTimestamps(incomingStatus, now),
      })
      .returning()

    await logActivity(tx, {
      companyId,
      leadId: created.id,
      type: "CREATED",
      metadata: { source },
      createdByUserId: actorUserId,
    })
    return created
  })
}

/* ------------------- Synchronisation demande personnalisée ---------------- */

export interface CustomRequestSyncInput {
  companyId: number
  requestId: number
  status: string
  hasBooking: boolean
  bookingId?: number | null
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  vehicleType?: string | null
  vehicleBrand?: string | null
  vehicleModel?: string | null
  typeLabel?: string | null
}

/**
 * Synchronise un prospect depuis une demande personnalisée. Idempotent
 * (source=CUSTOM_REQUEST, sourceExternalId=requestId). N'exécute rien si la
 * feature `leads_crm` n'est pas active pour l'entreprise.
 */
export async function syncLeadFromCustomRequest(input: CustomRequestSyncInput): Promise<void> {
  const incomingStatus = nextStatusFromCustomRequest("NEW", input.status, input.hasBooking)
  await upsertLeadFromExternalSource({
    companyId: input.companyId,
    source: "CUSTOM_REQUEST",
    sourceExternalId: String(input.requestId),
    incomingStatus,
    linkedBookingId: input.bookingId ?? null,
    contact: {
      name: input.customerName,
      email: input.customerEmail,
      phone: input.customerPhone,
      vehicleType: input.vehicleType,
      vehicleBrand: input.vehicleBrand,
      vehicleModel: input.vehicleModel,
      serviceInterest: input.typeLabel,
    },
  })
}

/**
 * Variante NON bloquante : isole toute erreur CRM pour ne jamais casser le flux
 * métier principal (envoi de demande). À utiliser dans les chemins publics.
 */
export async function safeSyncLeadFromCustomRequest(input: CustomRequestSyncInput): Promise<void> {
  try {
    await syncLeadFromCustomRequest(input)
  } catch (err) {
    // Migration CRM pas encore appliquée : état ATTENDU, log technique minimal
    // (aucune PII) et on n'alarme pas. Le flux « demande » continue normalement.
    if (isMissingRelationError(err)) {
      console.warn("[v0] leads: schéma non initialisé, sync custom_request ignorée", {
        companyId: input.companyId,
      })
      return
    }
    console.error("[v0] leads: échec sync custom_request", {
      companyId: input.companyId,
      requestId: input.requestId,
      error: err instanceof Error ? err.message : "unknown",
    })
  }
}

/* --------------------------- Synchronisation booking ---------------------- */

export interface BookingSyncInput {
  companyId: number
  bookingId: number
  status: string
  customerEmail?: string | null
  customerPhone?: string | null
}

/**
 * Synchronise le prospect FIABLEMENT lié à une réservation. Priorité au lien
 * explicite (linkedBookingId) ; sinon rapprochement par identité normalisée
 * (`classifyMatch`). Si PLUSIEURS prospects correspondent → ne choisit pas,
 * ne synchronise pas (évite un rattachement arbitraire). Ne fait jamais
 * régresser un CLIENT et ne marque jamais LOST automatiquement.
 */
export async function syncLeadFromBooking(input: BookingSyncInput): Promise<void> {
  const { companyId, bookingId, status } = input

  await db.transaction(async (tx) => {
    // A. Lien explicite.
    let [lead] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.companyId, companyId), eq(leads.linkedBookingId, bookingId)))
      .limit(1)

    // B. Rapprochement par identité (uniquement si aucun lien explicite).
    if (!lead) {
      const email = normalizeEmail(input.customerEmail)
      const phone = normalizePhone(input.customerPhone)
      if (!email && !phone) return

      const candidates = await tx
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.companyId, companyId),
            or(
              email ? eq(leads.emailNormalized, email) : undefined,
              phone ? eq(leads.phoneNormalized, phone) : undefined,
            ),
          ),
        )

      const anchor = { email, phone }
      const matched = candidates.filter(
        (c) => classifyMatch(anchor, { email: c.email, phone: c.phone }) === "match",
      )
      // Ambigu (0 ou >1) → on ne synchronise pas automatiquement.
      if (matched.length !== 1) return
      lead = matched[0]
    }

    const now = new Date()
    const current = lead.status as LeadStatus
    const nextStatus = nextStatusFromBooking(current, status)

    const patch: Partial<LeadRow> = { updatedAt: now, linkedBookingId: bookingId }
    const linkChanged = lead.linkedBookingId !== bookingId
    const statusChanged = nextStatus !== current
    if (statusChanged) {
      patch.status = nextStatus
      Object.assign(patch, lifecycleTimestamps(nextStatus, now))
    }

    await tx
      .update(leads)
      .set(patch)
      .where(and(eq(leads.id, lead.id), eq(leads.companyId, companyId)))

    if (linkChanged) {
      await logActivity(tx, {
        companyId,
        leadId: lead.id,
        type: "BOOKING_LINKED",
        metadata: { bookingId },
      })
    }
    if (statusChanged) {
      await logActivity(tx, {
        companyId,
        leadId: lead.id,
        type: "STATUS_CHANGED",
        metadata: { from: current, to: nextStatus, via: "booking", bookingStatus: status },
      })
    }
  })
}

/** Variante NON bloquante : une panne CRM ne doit jamais casser le booking. */
export async function safeSyncLeadFromBooking(input: BookingSyncInput): Promise<void> {
  try {
    await syncLeadFromBooking(input)
  } catch (err) {
    // Migration CRM pas encore appliquée : état ATTENDU, log minimal sans PII.
    // La réservation / le paiement continuent normalement.
    if (isMissingRelationError(err)) {
      console.warn("[v0] leads: schéma non initialisé, sync booking ignorée", {
        companyId: input.companyId,
      })
      return
    }
    console.error("[v0] leads: échec sync booking", {
      companyId: input.companyId,
      bookingId: input.bookingId,
      error: err instanceof Error ? err.message : "unknown",
    })
  }
}

/* ------------------------------ Anti-doublon ----------------------------- */

export interface DuplicateMatch {
  id: number
  contactName: string
  status: LeadStatus
  result: "match" | "review"
}

/**
 * Cherche un prospect existant avec une identité PROCHE (email exact, ou
 * téléphone identique sans email contradictoire). Ne fusionne jamais : sert
 * uniquement à prévenir l'utilisateur avant de créer un doublon manuel.
 */
export async function findDuplicateLead(
  companyId: number,
  email: string | null,
  phone: string | null,
): Promise<DuplicateMatch | null> {
  const e = normalizeEmail(email)
  const p = normalizePhone(phone)
  if (!e && !p) return null

  const candidates = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.companyId, companyId),
        or(
          e ? eq(leads.emailNormalized, e) : undefined,
          p ? eq(leads.phoneNormalized, p) : undefined,
        ),
      ),
    )
    .limit(25)

  const anchor = { email: e, phone: p }
  for (const c of candidates) {
    const r = classifyMatch(anchor, { email: c.email, phone: c.phone })
    if (r === "match" || r === "review") {
      return { id: c.id, contactName: c.contactName, status: c.status as LeadStatus, result: r }
    }
  }
  return null
}

/* ---------------------------- Création manuelle -------------------------- */

export interface CreateManualInput {
  companyId: number
  actorUserId: string
  contactName: string
  email?: string | null
  phone?: string | null
  vehicleType?: string | null
  vehicleBrand?: string | null
  vehicleModel?: string | null
  vehiclePlate?: string | null
  serviceInterest?: string | null
  internalSummary?: string | null
  nextFollowUpAt?: Date | null
}

export async function createManualLead(input: CreateManualInput): Promise<LeadRow> {
  const now = new Date()
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(leads)
      .values({
        companyId: input.companyId,
        source: "MANUAL",
        status: "NEW",
        contactName: cleanStr(input.contactName) ?? "Prospect",
        email: cleanStr(input.email),
        emailNormalized: normalizeEmail(input.email),
        phone: cleanStr(input.phone),
        phoneNormalized: normalizePhone(input.phone),
        vehicleType: cleanStr(input.vehicleType),
        vehicleBrand: cleanStr(input.vehicleBrand),
        vehicleModel: cleanStr(input.vehicleModel),
        vehiclePlate: cleanStr(input.vehiclePlate),
        serviceInterest: cleanStr(input.serviceInterest),
        internalSummary: cleanStr(input.internalSummary),
        nextFollowUpAt: input.nextFollowUpAt ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    await logActivity(tx, {
      companyId: input.companyId,
      leadId: created.id,
      type: "CREATED",
      metadata: { source: "MANUAL" },
      createdByUserId: input.actorUserId,
    })
    if (input.nextFollowUpAt) {
      await logActivity(tx, {
        companyId: input.companyId,
        leadId: created.id,
        type: "FOLLOW_UP_SET",
        metadata: { at: input.nextFollowUpAt.toISOString() },
        createdByUserId: input.actorUserId,
      })
    }
    return created
  })
}

/* ------------------------------- Mutations ------------------------------- */

/** Charge un prospect en garantissant l'appartenance au tenant (ou null). */
export async function getLeadForCompany(companyId: number, leadId: number): Promise<LeadRow | null> {
  const [row] = await leadRead(() =>
    db
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.companyId, companyId)))
      .limit(1),
  )
  return row ?? null
}

export interface UpdateLeadFields {
  contactName?: string
  email?: string | null
  phone?: string | null
  vehicleType?: string | null
  vehicleBrand?: string | null
  vehicleModel?: string | null
  vehiclePlate?: string | null
  serviceInterest?: string | null
  internalSummary?: string | null
}

export async function updateLeadFields(
  companyId: number,
  leadId: number,
  fields: UpdateLeadFields,
): Promise<LeadRow | null> {
  const patch: Partial<LeadRow> = { updatedAt: new Date() }
  if (fields.contactName !== undefined) patch.contactName = cleanStr(fields.contactName) ?? "Prospect"
  if (fields.email !== undefined) {
    patch.email = cleanStr(fields.email)
    patch.emailNormalized = normalizeEmail(fields.email)
  }
  if (fields.phone !== undefined) {
    patch.phone = cleanStr(fields.phone)
    patch.phoneNormalized = normalizePhone(fields.phone)
  }
  if (fields.vehicleType !== undefined) patch.vehicleType = cleanStr(fields.vehicleType)
  if (fields.vehicleBrand !== undefined) patch.vehicleBrand = cleanStr(fields.vehicleBrand)
  if (fields.vehicleModel !== undefined) patch.vehicleModel = cleanStr(fields.vehicleModel)
  if (fields.vehiclePlate !== undefined) patch.vehiclePlate = cleanStr(fields.vehiclePlate)
  if (fields.serviceInterest !== undefined) patch.serviceInterest = cleanStr(fields.serviceInterest)
  if (fields.internalSummary !== undefined) patch.internalSummary = cleanStr(fields.internalSummary)

  const [updated] = await db
    .update(leads)
    .set(patch)
    .where(and(eq(leads.id, leadId), eq(leads.companyId, companyId)))
    .returning()
  return updated ?? null
}

/**
 * Changement de statut MANUEL. Contrairement aux synchros automatiques,
 * l'utilisateur peut librement rouvrir un LOST ou revenir en arrière.
 * Met à jour le prospect ET l'activité dans la même transaction.
 */
export async function changeLeadStatusManual(
  companyId: number,
  leadId: number,
  nextStatus: LeadStatus,
  opts?: { actorUserId?: string | null; lostReason?: string | null },
): Promise<LeadRow | null> {
  return db.transaction(async (tx) => {
    const [lead] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.companyId, companyId)))
      .limit(1)
    if (!lead) return null

    const current = lead.status as LeadStatus
    if (current === nextStatus && nextStatus !== "LOST") return lead

    const now = new Date()
    const reopened = (current === "LOST" || current === "CLIENT") && nextStatus !== current
    const patch: Partial<LeadRow> = {
      status: nextStatus,
      updatedAt: now,
      lostReason: nextStatus === "LOST" ? cleanStr(opts?.lostReason) : null,
      ...lifecycleTimestamps(nextStatus, now),
    }
    const [updated] = await tx
      .update(leads)
      .set(patch)
      .where(and(eq(leads.id, leadId), eq(leads.companyId, companyId)))
      .returning()

    await logActivity(tx, {
      companyId,
      leadId,
      type: reopened ? "REOPENED" : "STATUS_CHANGED",
      metadata: {
        from: current,
        to: nextStatus,
        ...(nextStatus === "LOST" && opts?.lostReason ? { lostReason: opts.lostReason } : {}),
      },
      createdByUserId: opts?.actorUserId,
    })
    return updated
  })
}

export async function addLeadNote(
  companyId: number,
  leadId: number,
  message: string,
  actorUserId?: string | null,
): Promise<boolean> {
  const text = cleanStr(message)
  if (!text) return false
  return db.transaction(async (tx) => {
    const [lead] = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.companyId, companyId)))
      .limit(1)
    if (!lead) return false
    await tx
      .update(leads)
      .set({ updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.companyId, companyId)))
    await logActivity(tx, {
      companyId,
      leadId,
      type: "NOTE_ADDED",
      message: text,
      createdByUserId: actorUserId,
    })
    return true
  })
}

export async function setLeadFollowUp(
  companyId: number,
  leadId: number,
  at: Date | null,
  actorUserId?: string | null,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [lead] = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.companyId, companyId)))
      .limit(1)
    if (!lead) return false
    await tx
      .update(leads)
      .set({ nextFollowUpAt: at, updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.companyId, companyId)))
    await logActivity(tx, {
      companyId,
      leadId,
      type: at ? "FOLLOW_UP_SET" : "FOLLOW_UP_CLEARED",
      metadata: at ? { at: at.toISOString() } : null,
      createdByUserId: actorUserId,
    })
    return true
  })
}

/**
 * Supprime un prospect + ses activités (cascade DB). Ne supprime JAMAIS la
 * demande, la réservation, la facture, le client ou le paiement d'origine.
 */
export async function deleteLead(companyId: number, leadId: number): Promise<boolean> {
  const res = await db
    .delete(leads)
    .where(and(eq(leads.id, leadId), eq(leads.companyId, companyId)))
    .returning({ id: leads.id })
  return res.length > 0
}

/* -------------------------------- Requêtes ------------------------------- */

export interface LeadListFilter {
  companyId: number
  status?: LeadStatus | null
  source?: LeadSource | null
  /** Filtre spécial « à relancer » (relance due jusqu'à la fin de la journée métier). */
  dueBefore?: Date | null
  query?: string | null
  page?: number
  pageSize?: number
}

export interface LeadListItem {
  id: number
  contactName: string
  status: LeadStatus
  source: LeadSource
  email: string | null
  phone: string | null
  vehicleBrand: string | null
  vehicleModel: string | null
  serviceInterest: string | null
  nextFollowUpAt: Date | null
  lastActivityAt: Date
  createdAt: number
}

export interface LeadListResult {
  items: LeadListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Liste paginée et filtrée côté SERVEUR (jamais de chargement massif côté
 * navigateur). N'inclut PAS les activités complètes : la dernière activité est
 * calculée en une sous-requête (évite le N+1).
 */
export async function listLeads(filter: LeadListFilter): Promise<LeadListResult> {
  const page = Math.max(1, filter.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25))
  const offset = (page - 1) * pageSize

  const conds = [eq(leads.companyId, filter.companyId)]
  if (filter.status) conds.push(eq(leads.status, filter.status))
  if (filter.source) conds.push(eq(leads.source, filter.source))
  if (filter.dueBefore) {
    conds.push(isNotNull(leads.nextFollowUpAt))
    conds.push(lte(leads.nextFollowUpAt, filter.dueBefore))
  }
  if (filter.query) {
    const q = `%${filter.query.trim()}%`
    conds.push(
      or(
        ilike(leads.contactName, q),
        ilike(leads.email, q),
        ilike(leads.phone, q),
        ilike(leads.vehicleBrand, q),
        ilike(leads.vehicleModel, q),
      )!,
    )
  }
  const where = and(...conds)

  const lastActivityAt = sql<Date>`GREATEST(${leads.updatedAt}, COALESCE((
    SELECT MAX(${leadActivities.createdAt}) FROM ${leadActivities}
    WHERE ${leadActivities.leadId} = ${leads.id}
  ), ${leads.updatedAt}))`

  const [rows, totalRows] = await leadRead(() =>
    Promise.all([
      db
        .select({
          id: leads.id,
          contactName: leads.contactName,
          status: leads.status,
          source: leads.source,
          email: leads.email,
          phone: leads.phone,
          vehicleBrand: leads.vehicleBrand,
          vehicleModel: leads.vehicleModel,
          serviceInterest: leads.serviceInterest,
          nextFollowUpAt: leads.nextFollowUpAt,
          createdAt: leads.createdAt,
          lastActivityAt,
        })
        .from(leads)
        .where(where)
        .orderBy(desc(lastActivityAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ n: sql<number>`count(*)::int` }).from(leads).where(where),
    ]),
  )

  const total = totalRows[0]?.n ?? 0
  return {
    items: rows.map((r) => {
      // `lastActivityAt` provient d'une expression SQL calculée (`GREATEST`) et
      // `createdAt` du driver : les deux peuvent arriver en Date, string PG ou
      // number selon le chemin. On garantit la conversion au runtime, jamais via
      // le seul type générique `sql<Date>`.
      const created = toValidDate(r.createdAt)
      const lastActivity = toValidDate(r.lastActivityAt)
      return {
        id: r.id,
        contactName: r.contactName,
        status: r.status as LeadStatus,
        source: r.source as LeadSource,
        email: r.email,
        phone: r.phone,
        vehicleBrand: r.vehicleBrand,
        vehicleModel: r.vehicleModel,
        serviceInterest: r.serviceInterest,
        nextFollowUpAt: r.nextFollowUpAt,
        // Repli métier sûr : dernière activité → sinon création réelle → sinon epoch.
        // On n'invente jamais `new Date()` (activité récente factice).
        lastActivityAt: lastActivity ?? created ?? new Date(0),
        createdAt: created?.getTime() ?? 0,
      }
    }),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export interface LeadKpis {
  newCount: number
  toFollowUp: number
  appointment: number
  client: number
}

/**
 * KPIs compacts. « À relancer » = relance due (<= fin de journée métier) sur un
 * prospect non clôturé (ni CLIENT ni LOST).
 */
export async function getLeadKpis(companyId: number, dueBefore: Date): Promise<LeadKpis> {
  const rows = await leadRead(() =>
    db
      .select({ status: leads.status, n: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.companyId, companyId))
      .groupBy(leads.status),
  )

  const byStatus = new Map<string, number>(rows.map((r) => [r.status, r.n]))
  const [due] = await leadRead(() =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          eq(leads.companyId, companyId),
          isNotNull(leads.nextFollowUpAt),
          lte(leads.nextFollowUpAt, dueBefore),
          inArray(leads.status, ["NEW", "CONTACTED", "APPOINTMENT_BOOKED"]),
        ),
      ),
  )

  return {
    newCount: byStatus.get("NEW") ?? 0,
    toFollowUp: due?.n ?? 0,
    appointment: byStatus.get("APPOINTMENT_BOOKED") ?? 0,
    client: byStatus.get("CLIENT") ?? 0,
  }
}

/**
 * Nombre de relances dues (pour l'encart dashboard « À traiter »). TOLÉRANT :
 * renvoie 0 si le schéma CRM n'est pas encore présent, afin que le dashboard
 * principal ne casse jamais avant l'application de la migration.
 */
export async function countDueFollowUps(companyId: number, dueBefore: Date): Promise<number> {
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          eq(leads.companyId, companyId),
          isNotNull(leads.nextFollowUpAt),
          lte(leads.nextFollowUpAt, dueBefore),
          inArray(leads.status, ["NEW", "CONTACTED", "APPOINTMENT_BOOKED"]),
        ),
      )
    return row?.n ?? 0
  } catch (err) {
    if (isMissingRelationError(err)) return 0
    throw err
  }
}

/** Détail complet d'un prospect + historique chronologique (fiche). */
export async function getLeadDetail(
  companyId: number,
  leadId: number,
): Promise<{ lead: LeadRow; activities: LeadActivityRow[] } | null> {
  const lead = await getLeadForCompany(companyId, leadId)
  if (!lead) return null
  // La table `leads` peut exister sans `lead_activities` (migration partielle) :
  // cette lecture passe aussi par `leadRead()` pour convertir « table absente »
  // en `LeadsSchemaNotReadyError` au lieu de propager une 500.
  const activities = await leadRead(() =>
    db
      .select()
      .from(leadActivities)
      .where(and(eq(leadActivities.companyId, companyId), eq(leadActivities.leadId, leadId)))
      .orderBy(desc(leadActivities.createdAt)),
  )
  return { lead, activities }
}
