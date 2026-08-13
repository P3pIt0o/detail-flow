"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, betaLeads, smsRechargeRequests } from "@/lib/db/schema"
import { requireSuperAdmin } from "@/lib/admin"
import {
  provisionCompany,
  removeDemoData,
  resetOwnerPassword,
  deleteCompanyCompletely,
  type ProvisionResult,
} from "@/lib/company/provision"
import { creditFromRecharge } from "@/lib/sms/credits"
import { allocateDeltaToTenant } from "@/lib/sms/send"
import { sendEmail } from "@/lib/email/send"
import { smsCreditedEmail } from "@/lib/email/templates"
import { tenantAdminUrl } from "@/lib/tenant-shared"

/* -------------------------------------------------------------------------- */
/*  Actions de super-administration. TOUTES commencent par requireSuperAdmin().*/
/* -------------------------------------------------------------------------- */

type ActionState =
  | { ok: true; result?: ProvisionResult; message?: string }
  | { ok: false; error: string }

/** Crée une entreprise (+ owner, réglages, horaires, démo optionnelle). */
export async function createCompanyAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin()

  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim()
  const ownerName = String(formData.get("ownerName") ?? "").trim()
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const brandPrimary = String(formData.get("brandPrimary") ?? "").trim()
  const withDemo = formData.get("withDemo") === "on"
  const betaDaysRaw = Number(formData.get("betaDays") ?? 30)
  const betaDays = Number.isFinite(betaDaysRaw) && betaDaysRaw > 0 ? Math.floor(betaDaysRaw) : 30

  if (!name || !ownerName || !ownerEmail) {
    return { ok: false, error: "Nom d'entreprise, nom et email du propriétaire sont requis." }
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    return { ok: false, error: "Email du propriétaire invalide." }
  }

  try {
    const result = await provisionCompany({
      name,
      slug,
      ownerName,
      ownerEmail,
      city: city || undefined,
      brandPrimary: brandPrimary || undefined,
      betaDays,
      withDemo,
    })
    revalidatePath("/super-admin")
    revalidatePath("/super-admin/companies")
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Convertit une entreprise BETA en ACTIVE (aucune migration : simple statut). */
export async function convertToActiveAction(companyId: number): Promise<ActionState> {
  await requireSuperAdmin()
  try {
    await db
      .update(companies)
      .set({ status: "ACTIVE", bookingMode: "LIVE", noindex: false, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
    revalidatePath("/super-admin")
    revalidatePath("/super-admin/companies")
    return { ok: true, message: "Entreprise convertie en cliente active." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Prolonge le programme beta de `days` jours à partir de maintenant. */
export async function extendBetaAction(companyId: number, days: number): Promise<ActionState> {
  await requireSuperAdmin()
  const d = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30
  try {
    const betaEndsAt = new Date(Date.now() + d * 24 * 60 * 60 * 1000)
    await db
      .update(companies)
      .set({ status: "BETA", betaEndsAt, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
    revalidatePath("/super-admin")
    revalidatePath("/super-admin/companies")
    return { ok: true, message: `Programme beta prolongé de ${d} jours.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Change le statut (SUSPENDED / ARCHIVED / BETA / ACTIVE). */
export async function setStatusAction(companyId: number, status: string): Promise<ActionState> {
  await requireSuperAdmin()
  const allowed = ["BETA", "ACTIVE", "SUSPENDED", "ARCHIVED"]
  if (!allowed.includes(status)) return { ok: false, error: "Statut invalide." }
  try {
    await db.update(companies).set({ status, updatedAt: new Date() }).where(eq(companies.id, companyId))
    revalidatePath("/super-admin")
    revalidatePath("/super-admin/companies")
    return { ok: true, message: `Statut mis à jour : ${status}.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Supprime uniquement les données de démonstration (avant passage en prod). */
export async function removeDemoDataAction(companyId: number): Promise<ActionState> {
  await requireSuperAdmin()
  try {
    const removed = await removeDemoData(companyId)
    revalidatePath("/super-admin")
    revalidatePath("/super-admin/companies")
    return { ok: true, message: `${removed} réservation(s) de démonstration supprimée(s).` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Termine immédiatement la bêta : date de fin = maintenant, réservations coupées. */
export async function endBetaAction(companyId: number): Promise<ActionState> {
  await requireSuperAdmin()
  try {
    await db
      .update(companies)
      .set({ status: "BETA", betaEndsAt: new Date(), bookingMode: "DISABLED", updatedAt: new Date() })
      .where(eq(companies.id, companyId))
    revalidatePath("/super-admin")
    return { ok: true, message: "Programme beta terminé (nouvelles réservations désactivées)." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/* -------------------------------------------------------------------------- */
/*  Suppression DÉFINITIVE d'une entreprise (irréversible)                     */
/* -------------------------------------------------------------------------- */

export type DeleteCompanyState =
  | { ok: true; message: string }
  | { ok: false; error: string }

/**
 * Supprime définitivement une entreprise et toutes ses données.
 *
 * Double confirmation côté SERVEUR (jamais uniquement par l'UI) : le nom saisi
 * par le super-admin doit correspondre EXACTEMENT au nom de l'entreprise.
 * Réservé au super-admin (requireSuperAdmin).
 */
export async function deleteCompanyAction(companyId: number, confirmName: string): Promise<DeleteCompanyState> {
  await requireSuperAdmin()
  try {
    const [company] = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
    if (!company) return { ok: false, error: "Entreprise introuvable (déjà supprimée ?)." }

    if (confirmName.trim() !== company.name.trim()) {
      return { ok: false, error: "Le nom saisi ne correspond pas exactement au nom de l'entreprise." }
    }

    const result = await deleteCompanyCompletely(companyId)
    revalidatePath("/super-admin")
    revalidatePath("/super-admin/companies")
    return {
      ok: true,
      message: `Entreprise « ${result.name} » supprimée définitivement — ${result.deletedUsers} utilisateur(s) et ${result.deletedBlobs} fichier(s) supprimés.`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/* -------------------------------------------------------------------------- */
/*  Mot de passe temporaire du propriétaire                                    */
/* -------------------------------------------------------------------------- */

export type ResetPasswordState =
  | { ok: true; tempPassword: string; ownerEmail: string }
  | { ok: false; error: string }

/** Réinitialise / régénère le mot de passe temporaire du propriétaire. */
export async function resetOwnerPasswordAction(companyId: number): Promise<ResetPasswordState> {
  await requireSuperAdmin()
  try {
    const { tempPassword, ownerEmail } = await resetOwnerPassword(companyId)
    revalidatePath("/super-admin")
    return { ok: true, tempPassword, ownerEmail }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/* -------------------------------------------------------------------------- */
/*  Demandes du Programme Beta (beta_leads)                                    */
/* -------------------------------------------------------------------------- */

export type AcceptLeadState =
  | { ok: true; result: ProvisionResult }
  | { ok: false; error: string }

/**
 * Accepte une demande beta : provisionne une entreprise complète (company +
 * tenant + compte administrateur) à partir des informations du prospect, puis
 * marque la demande comme convertie. Le slug est dérivé du nom d'entreprise.
 */
export async function acceptBetaLeadAction(leadId: number): Promise<AcceptLeadState> {
  await requireSuperAdmin()
  try {
    const [lead] = await db.select().from(betaLeads).where(eq(betaLeads.id, leadId)).limit(1)
    if (!lead) return { ok: false, error: "Demande introuvable." }
    if (lead.status === "converted") return { ok: false, error: "Cette demande a déjà été convertie." }

    const result = await provisionCompany({
      name: lead.businessName,
      slug: lead.businessName, // normalisé + validé dans provisionCompany
      ownerName: lead.contactName,
      ownerEmail: lead.email,
      city: lead.city ?? undefined,
      withDemo: false,
    })

    await db.update(betaLeads).set({ status: "converted" }).where(eq(betaLeads.id, leadId))
    revalidatePath("/super-admin")
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Refuse une demande beta (statut → declined). */
export async function declineBetaLeadAction(leadId: number): Promise<ActionState> {
  await requireSuperAdmin()
  try {
    await db.update(betaLeads).set({ status: "declined" }).where(eq(betaLeads.id, leadId))
    revalidatePath("/super-admin")
    return { ok: true, message: "Demande refusée." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/**
 * Supprime DÉFINITIVEMENT une candidature beta (ligne beta_leads uniquement).
 *
 * IMPORTANT : `beta_leads` est une table indépendante. Cette action ne touche
 * JAMAIS aux entreprises, comptes, réservations, clients ou factures — même si
 * la candidature a déjà été convertie en entreprise, seule la ligne de la liste
 * des candidatures est supprimée (l'entreprise/tenant reste intacte).
 * Réservé au super-admin (requireSuperAdmin).
 */
export async function deleteBetaLeadAction(leadId: number): Promise<ActionState> {
  await requireSuperAdmin()
  try {
    await db.delete(betaLeads).where(eq(betaLeads.id, leadId))
    revalidatePath("/super-admin")
    return { ok: true, message: "Candidature supprimée." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Repasse une demande refusée en attente (statut → new). */
export async function reopenBetaLeadAction(leadId: number): Promise<ActionState> {
  await requireSuperAdmin()
  try {
    await db.update(betaLeads).set({ status: "new" }).where(eq(betaLeads.id, leadId))
    revalidatePath("/super-admin")
    return { ok: true, message: "Demande remise en attente." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/* ----------------------------- Recharges SMS ----------------------------- */

/**
 * « Paiement reçu — créditer les SMS ».
 *
 * IDEMPOTENT : le crédit réel se fait dans creditFromRecharge() via un UPDATE
 * conditionnel `status = 'pending'` en transaction — un double clic ou un
 * rechargement ne crédite jamais deux fois. L'email de confirmation n'est
 * envoyé que si le crédit a effectivement eu lieu (already=false).
 */
export async function confirmSmsRechargeAction(requestId: number): Promise<ActionState> {
  await requireSuperAdmin()
  try {
    const res = await creditFromRecharge(requestId)
    if (!res.ok) return { ok: false, error: res.error }

    if (!res.already) {
      // Confirmation au professionnel (best-effort : n'invalide pas le crédit).
      try {
        const [company] = await db
          .select({ name: companies.name, slug: companies.slug, email: companies.email, phone: companies.phone })
          .from(companies)
          .where(eq(companies.id, res.companyId))
          .limit(1)
        if (company?.email) {
          const mail = smsCreditedEmail({
            companyName: company.name,
            quantity: res.quantity,
            newBalance: res.newBalance,
            adminUrl: tenantAdminUrl(company.slug),
            businessEmail: company.email,
            businessPhone: company.phone,
          })
          await sendEmail({ to: company.email, subject: mail.subject, html: mail.html })
        }
      } catch (mailErr) {
        console.log("[v0] smsCreditedEmail failed:", mailErr instanceof Error ? mailErr.message : mailErr)
      }
    }

    revalidatePath("/super-admin")
    return {
      ok: true,
      message: res.already ? "Déjà créditée (aucune action)." : `${res.quantity} SMS crédités.`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/**
 * Alloue au sous-compte AllMySMS du tenant UNIQUEMENT le delta non encore
 * transféré (total accordé/acheté − déjà alloué). RÉSERVÉ au super-admin.
 *
 * Déclenchement MANUEL. Aucun `companyId` du navigateur n'est fiable : ici il
 * provient de la ligne de recharge côté serveur. Idempotent grâce au cumul
 * `allmysmsCreditsAllocated` : un second appel sans nouveau crédit transfère 0.
 */
export async function allocateSmsCreditsAction(companyId: number): Promise<ActionState> {
  await requireSuperAdmin()
  try {
    const res = await allocateDeltaToTenant(companyId)
    if (!res.ok) return { ok: false, error: res.error ?? "Échec de l'allocation AllMySMS." }
    revalidatePath("/super-admin")
    return {
      ok: true,
      message:
        res.allocated > 0
          ? `${res.allocated} crédit(s) alloué(s) au sous-compte (total ${res.totalGranted}, déjà ${res.alreadyAllocated}).`
          : `Aucun crédit à allouer (total ${res.totalGranted} déjà entièrement attribué).`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}

/** Annule une demande de recharge encore en attente (ne crédite rien). */
export async function cancelSmsRechargeAction(requestId: number): Promise<ActionState> {
  await requireSuperAdmin()
  try {
    await db
      .update(smsRechargeRequests)
      .set({ status: "cancelled" })
      .where(and(eq(smsRechargeRequests.id, requestId), eq(smsRechargeRequests.status, "pending")))
    revalidatePath("/super-admin")
    return { ok: true, message: "Demande annulée." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue." }
  }
}
