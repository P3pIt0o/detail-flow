"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { customRequests } from "@/lib/db/schema"
import { sendCustomRequestDecision } from "@/lib/email/custom-requests"

type DecisionResult = { status: "idle" | "success" | "error"; message?: string; decision?: "accepted" | "declined" }

/**
 * Décision du client (accepter / refuser) via le lien sécurisé par token.
 * AUCUNE authentification : l'autorisation vient UNIQUEMENT du token aléatoire
 * (non devinable, unique). On ne cible la ligne QUE par ce token, donc aucune
 * autre entreprise n'est jamais touchée. Idempotent : ne modifie que si la
 * proposition est encore en attente de réponse.
 */
export async function decideCustomRequest(
  _prev: DecisionResult,
  formData: FormData,
): Promise<DecisionResult> {
  const token = String(formData.get("token") ?? "").trim()
  const decision = String(formData.get("decision") ?? "").trim()

  if (!token) return { status: "error", message: "Lien invalide." }
  if (decision !== "accepted" && decision !== "declined") {
    return { status: "error", message: "Action invalide." }
  }

  const [row] = await db.select().from(customRequests).where(eq(customRequests.token, token)).limit(1)
  if (!row) return { status: "error", message: "Cette proposition est introuvable ou a expiré." }

  // Seule une proposition envoyée (non encore décidée) peut être acceptée/refusée.
  if (row.status !== "proposal_sent") {
    if (row.status === "accepted" || row.status === "converted") {
      return { status: "success", message: "Vous avez déjà accepté cette proposition.", decision: "accepted" }
    }
    if (row.status === "declined") {
      return { status: "success", message: "Vous avez déjà refusé cette proposition.", decision: "declined" }
    }
    return { status: "error", message: "Cette proposition n'est plus disponible." }
  }

  await db
    .update(customRequests)
    .set({ status: decision, respondedAt: new Date(), updatedAt: new Date() })
    .where(eq(customRequests.token, token))

  // Notifie le professionnel (non bloquant).
  await sendCustomRequestDecision({
    companyId: row.companyId,
    id: row.id,
    customerName: row.customerName,
    typeLabel: row.typeLabel,
    decision,
  })

  revalidatePath("/admin/demandes")
  revalidatePath(`/admin/demandes/${row.id}`)

  return {
    status: "success",
    decision,
    message:
      decision === "accepted"
        ? "Merci ! Votre acceptation a bien été enregistrée."
        : "Votre réponse a bien été enregistrée.",
  }
}
