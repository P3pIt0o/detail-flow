"use server"

/**
 * CRM PROSPECTS — ACTIONS SERVEUR.
 *
 * Chaque action :
 *  1. résout le tenant CÔTÉ SERVEUR (`requireCompanyMember`) — jamais de
 *     companyId reçu du formulaire / de l'URL / du state client ;
 *  2. vérifie la licence `leads_crm` (`canUseFeature`) ;
 *  3. vérifie que le prospect appartient bien au tenant (les fonctions serveur
 *     sont toutes scopées par companyId) ;
 *  4. journalise l'activité dans la même transaction que la mutation.
 */

import { revalidatePath } from "next/cache"
import { requireCompanyMember } from "@/lib/admin"
import { canUseFeature } from "@/lib/licensing/enforce"
import { businessToday } from "@/lib/analytics/periods"
import {
  addDaysYmd,
  isLeadLostReason,
  isLeadStatus,
  zonedStartOfDayUtc,
  type LeadStatus,
} from "@/lib/leads/model"
import {
  addLeadNote,
  changeLeadStatusManual,
  createManualLead,
  deleteLead,
  findDuplicateLead,
  setLeadFollowUp,
  updateLeadFields,
} from "@/lib/leads/server"

export type ActionResult =
  | { ok: true; leadId?: number }
  | { ok: false; error: string; duplicate?: { id: number; contactName: string } }

/** Garde commune : tenant serveur + licence. Lève si non autorisé. */
async function guard() {
  const ctx = await requireCompanyMember()
  const allowed = await canUseFeature(ctx.tenant.id, "leads_crm")
  if (!allowed) throw new Error("FEATURE_LOCKED")
  return ctx
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key)
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length ? t : null
}

/* ------------------------------- Création -------------------------------- */

export async function createLeadAction(fd: FormData): Promise<ActionResult> {
  const ctx = await guard()
  const companyId = ctx.tenant.id

  const contactName = str(fd, "contactName")
  const email = str(fd, "email")
  const phone = str(fd, "phone")
  // Minimum : nom + (email OU téléphone).
  if (!contactName) return { ok: false, error: "Le nom du prospect est obligatoire." }
  if (!email && !phone) {
    return { ok: false, error: "Renseignez au moins un email ou un téléphone." }
  }

  // Anti-doublon : prévenir sans fusionner. `force=1` = l'utilisateur confirme.
  const force = str(fd, "force") === "1"
  if (!force) {
    const dup = await findDuplicateLead(companyId, email, phone)
    if (dup) {
      return {
        ok: false,
        error: "Un prospect avec ces coordonnées existe déjà.",
        duplicate: { id: dup.id, contactName: dup.contactName },
      }
    }
  }

  // Relance éventuelle via preset (jours) résolue dans le fuseau tenant.
  const followDays = str(fd, "followUpInDays")
  let nextFollowUpAt: Date | null = null
  if (followDays != null && /^\d+$/.test(followDays)) {
    const today = businessToday(new Date(), ctx.tenant.timezone)
    nextFollowUpAt = zonedStartOfDayUtc(addDaysYmd(today, Number(followDays)), ctx.tenant.timezone)
  }

  const lead = await createManualLead({
    companyId,
    actorUserId: ctx.user.id,
    contactName,
    email,
    phone,
    vehicleType: str(fd, "vehicleType"),
    vehicleBrand: str(fd, "vehicleBrand"),
    vehicleModel: str(fd, "vehicleModel"),
    vehiclePlate: str(fd, "vehiclePlate"),
    serviceInterest: str(fd, "serviceInterest"),
    internalSummary: str(fd, "internalSummary"),
    nextFollowUpAt,
  })

  revalidatePath("/admin/leads")
  return { ok: true, leadId: lead.id }
}

/* ------------------------------- Édition --------------------------------- */

export async function updateLeadAction(fd: FormData): Promise<ActionResult> {
  const ctx = await guard()
  const leadId = Number(str(fd, "leadId"))
  if (!Number.isInteger(leadId) || leadId <= 0) return { ok: false, error: "Prospect introuvable." }

  const contactName = str(fd, "contactName")
  if (!contactName) return { ok: false, error: "Le nom du prospect est obligatoire." }

  const updated = await updateLeadFields(ctx.tenant.id, leadId, {
    contactName,
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    vehicleType: str(fd, "vehicleType"),
    vehicleBrand: str(fd, "vehicleBrand"),
    vehicleModel: str(fd, "vehicleModel"),
    vehiclePlate: str(fd, "vehiclePlate"),
    serviceInterest: str(fd, "serviceInterest"),
    internalSummary: str(fd, "internalSummary"),
  })
  if (!updated) return { ok: false, error: "Prospect introuvable." }

  revalidatePath(`/admin/leads/${leadId}`)
  revalidatePath("/admin/leads")
  return { ok: true, leadId }
}

/* ---------------------------- Changement statut -------------------------- */

export async function changeLeadStatusAction(fd: FormData): Promise<ActionResult> {
  const ctx = await guard()
  const leadId = Number(str(fd, "leadId"))
  const status = str(fd, "status")
  if (!Number.isInteger(leadId) || leadId <= 0) return { ok: false, error: "Prospect introuvable." }
  if (!isLeadStatus(status)) return { ok: false, error: "Statut invalide." }

  const lostReasonRaw = str(fd, "lostReason")
  const lostReason = isLeadLostReason(lostReasonRaw) ? lostReasonRaw : null

  const updated = await changeLeadStatusManual(ctx.tenant.id, leadId, status as LeadStatus, {
    actorUserId: ctx.user.id,
    lostReason,
  })
  if (!updated) return { ok: false, error: "Prospect introuvable." }

  revalidatePath(`/admin/leads/${leadId}`)
  revalidatePath("/admin/leads")
  return { ok: true, leadId }
}

/* -------------------------------- Notes ---------------------------------- */

export async function addLeadNoteAction(fd: FormData): Promise<ActionResult> {
  const ctx = await guard()
  const leadId = Number(str(fd, "leadId"))
  const message = str(fd, "message")
  if (!Number.isInteger(leadId) || leadId <= 0) return { ok: false, error: "Prospect introuvable." }
  if (!message) return { ok: false, error: "La note est vide." }

  const ok = await addLeadNote(ctx.tenant.id, leadId, message, ctx.user.id)
  if (!ok) return { ok: false, error: "Prospect introuvable." }

  revalidatePath(`/admin/leads/${leadId}`)
  return { ok: true, leadId }
}

/* ------------------------------- Relance --------------------------------- */

export async function setLeadFollowUpAction(fd: FormData): Promise<ActionResult> {
  const ctx = await guard()
  const leadId = Number(str(fd, "leadId"))
  if (!Number.isInteger(leadId) || leadId <= 0) return { ok: false, error: "Prospect introuvable." }

  const clear = str(fd, "clear") === "1"
  let at: Date | null = null
  if (!clear) {
    const tz = ctx.tenant.timezone
    const today = businessToday(new Date(), tz)
    const preset = str(fd, "followUpInDays")
    const custom = str(fd, "followUpDate")
    if (custom && /^\d{4}-\d{2}-\d{2}$/.test(custom)) {
      at = zonedStartOfDayUtc(custom, tz)
    } else if (preset != null && /^\d+$/.test(preset)) {
      at = zonedStartOfDayUtc(addDaysYmd(today, Number(preset)), tz)
    } else {
      return { ok: false, error: "Date de relance invalide." }
    }
  }

  const ok = await setLeadFollowUp(ctx.tenant.id, leadId, at, ctx.user.id)
  if (!ok) return { ok: false, error: "Prospect introuvable." }

  revalidatePath(`/admin/leads/${leadId}`)
  revalidatePath("/admin/leads")
  return { ok: true, leadId }
}

/* ----------------------------- Suppression ------------------------------- */

export async function deleteLeadAction(fd: FormData): Promise<ActionResult> {
  const ctx = await guard()
  const leadId = Number(str(fd, "leadId"))
  if (!Number.isInteger(leadId) || leadId <= 0) return { ok: false, error: "Prospect introuvable." }

  const ok = await deleteLead(ctx.tenant.id, leadId)
  if (!ok) return { ok: false, error: "Prospect introuvable." }

  revalidatePath("/admin/leads")
  return { ok: true }
}
