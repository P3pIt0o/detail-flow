import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, settings as settingsTable } from "@/lib/db/schema"
import { sendEmail } from "./send"
import {
  customRequestNewLeadEmail,
  customRequestProposalEmail,
  customRequestDecisionEmail,
} from "./templates"

/** Identité email (nom + coordonnées) de l'entreprise, comme loadBookingEmailData. */
async function loadIdentity(companyId: number) {
  const [s] = await db
    .select({
      businessName: settingsTable.businessName,
      businessEmail: settingsTable.businessEmail,
      businessPhone: settingsTable.businessPhone,
    })
    .from(settingsTable)
    .where(eq(settingsTable.companyId, companyId))
    .limit(1)
  const [c] = await db
    .select({ name: companies.name, slug: companies.slug })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  const businessName = s?.businessName?.trim() || c?.name?.trim() || "Votre professionnel"
  return {
    businessName,
    businessEmail: s?.businessEmail ?? null,
    businessPhone: s?.businessPhone ?? null,
    slug: c?.slug ?? "",
  }
}

/** Base absolue du site public/admin du tenant (?tenant= sur le domaine racine). */
function baseUrl(slug: string): string {
  const raw = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "")
  if (!raw) return "" // aperçu/local : liens relatifs (non cliquables en email mais non bloquant)
  const root = raw.startsWith("www.") ? raw : `www.${raw}`
  return `https://${root}`
}

function publicRequestUrl(slug: string, token: string, intent?: "accept" | "refuse"): string {
  const base = baseUrl(slug)
  const q = slug ? `?tenant=${encodeURIComponent(slug)}` : ""
  const i = intent ? `${q ? "&" : "?"}intent=${intent}` : ""
  return `${base}/demande/${encodeURIComponent(token)}${q}${i}`
}

function adminRequestUrl(slug: string, id: number): string {
  const base = baseUrl(slug)
  const q = slug ? `?tenant=${encodeURIComponent(slug)}` : ""
  return `${base}/admin/demandes/${id}${q}`
}

/** Notifie le professionnel qu'une nouvelle demande est arrivée. Non bloquant. */
export async function sendCustomRequestNewLead(input: {
  companyId: number
  id: number
  typeLabel: string
  customerName: string
  customerEmail: string
  customerPhone: string
  description: string
  detailLines: { label: string; value: string }[]
}): Promise<void> {
  try {
    const identity = await loadIdentity(input.companyId)
    if (!identity.businessEmail) return // aucun email pro configuré
    const mail = customRequestNewLeadEmail({
      businessName: identity.businessName,
      businessEmail: identity.businessEmail,
      businessPhone: identity.businessPhone,
      typeLabel: input.typeLabel,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      description: input.description,
      detailLines: input.detailLines,
      adminUrl: adminRequestUrl(identity.slug, input.id),
    })
    await sendEmail({
      to: identity.businessEmail,
      subject: mail.subject,
      html: mail.html,
      fromName: identity.businessName,
      replyTo: input.customerEmail,
    })
  } catch (e) {
    console.log("[v0] sendCustomRequestNewLead a échoué:", e instanceof Error ? e.message : e)
  }
}

/** Envoie la proposition au client (avec liens accepter/refuser). Non bloquant. */
export async function sendCustomRequestProposal(input: {
  companyId: number
  token: string
  customerEmail: string
  customerName: string
  proposalTitle: string
  proposalDescription?: string | null
  proposalPriceCents: number
  proposalDurationMin: number
  proposalMessage?: string | null
}): Promise<void> {
  try {
    const identity = await loadIdentity(input.companyId)
    const mail = customRequestProposalEmail({
      businessName: identity.businessName,
      businessEmail: identity.businessEmail,
      businessPhone: identity.businessPhone,
      customerName: input.customerName,
      proposalTitle: input.proposalTitle,
      proposalDescription: input.proposalDescription,
      proposalPriceCents: input.proposalPriceCents,
      proposalDurationMin: input.proposalDurationMin,
      proposalMessage: input.proposalMessage,
      acceptUrl: publicRequestUrl(identity.slug, input.token, "accept"),
      refuseUrl: publicRequestUrl(identity.slug, input.token, "refuse"),
    })
    await sendEmail({
      to: input.customerEmail,
      subject: mail.subject,
      html: mail.html,
      fromName: identity.businessName,
      replyTo: identity.businessEmail ?? undefined,
    })
  } catch (e) {
    console.log("[v0] sendCustomRequestProposal a échoué:", e instanceof Error ? e.message : e)
  }
}

/** Notifie le professionnel de la décision du client (accepté/refusé). Non bloquant. */
export async function sendCustomRequestDecision(input: {
  companyId: number
  id: number
  typeLabel: string
  customerName: string
  decision: "accepted" | "declined"
}): Promise<void> {
  try {
    const identity = await loadIdentity(input.companyId)
    if (!identity.businessEmail) return
    const mail = customRequestDecisionEmail({
      businessName: identity.businessName,
      businessEmail: identity.businessEmail,
      businessPhone: identity.businessPhone,
      customerName: input.customerName,
      typeLabel: input.typeLabel,
      decision: input.decision,
      adminUrl: adminRequestUrl(identity.slug, input.id),
    })
    await sendEmail({
      to: identity.businessEmail,
      subject: mail.subject,
      html: mail.html,
      fromName: identity.businessName,
    })
  } catch (e) {
    console.log("[v0] sendCustomRequestDecision a échoué:", e instanceof Error ? e.message : e)
  }
}
