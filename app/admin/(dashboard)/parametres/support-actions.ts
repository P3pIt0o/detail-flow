"use server"

import { requireCompanyMember } from "@/lib/admin"
import { sendEmail } from "@/lib/email/send"

/** Adresse de support de la plateforme. */
const SUPPORT_EMAIL = "support@detailflow.fr"

export type SupportResult = { ok: boolean; error?: string; skipped?: boolean }

/** Échappe le HTML pour éviter toute injection dans l'email de rapport. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Envoie un rapport de support à l'équipe DetailFlow.
 *
 * Le contexte technique (tenant, entreprise, utilisateur, date/heure) est résolu
 * CÔTÉ SERVEUR à partir de la session — jamais fourni par le client — pour
 * garantir l'exactitude et l'isolation multi-tenant. Le client ne transmet que
 * la description et les informations disponibles uniquement côté navigateur
 * (URL, user-agent, plateforme).
 */
export async function sendSupportReport(input: {
  description: string
  url: string
  userAgent: string
  platform: string
}): Promise<SupportResult> {
  const { tenant, user } = await requireCompanyMember()

  const description = input.description.trim()
  if (description.length < 5) {
    return { ok: false, error: "Merci de décrire le problème (au moins quelques mots)." }
  }

  const now = new Date()
  const dateStr = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone: tenant.timezone || "Europe/Paris",
  }).format(now)

  const rows: Array<[string, string]> = [
    ["Entreprise", `${tenant.name} (#${tenant.id})`],
    ["Tenant (slug)", tenant.slug],
    ["Utilisateur", `${user.name} — ${user.email}`],
    ["URL", input.url || "(non fournie)"],
    ["Navigateur", input.userAgent || "(non fourni)"],
    ["Appareil / plateforme", input.platform || "(non fourni)"],
    ["Date et heure", dateStr],
  ]

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px">
      <h2 style="margin:0 0 12px">Nouveau rapport de support</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 10px;background:#f4f4f5;font-weight:600;white-space:nowrap;vertical-align:top">${esc(
                k,
              )}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(v)}</td></tr>`,
          )
          .join("")}
      </table>
      <h3 style="margin:18px 0 6px">Description</h3>
      <p style="white-space:pre-wrap;font-size:14px;line-height:1.6">${esc(description)}</p>
    </div>
  `

  const res = await sendEmail({
    to: SUPPORT_EMAIL,
    subject: `[Support] ${tenant.name} — ${tenant.slug}`,
    html,
    fromName: "DetailFlow Support",
    replyTo: user.email,
  })

  if (res.skipped) {
    return { ok: false, skipped: true, error: "Service d'email non configuré (RESEND_API_KEY)." }
  }
  if (!res.ok) {
    return { ok: false, error: res.error ?? "L'envoi a échoué. Réessayez plus tard." }
  }
  return { ok: true }
}
