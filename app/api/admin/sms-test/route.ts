import { NextResponse } from "next/server"
import { sendSms } from "@/lib/sms/send"

// Jamais mis en cache, jamais exécuté au build : uniquement sur appel manuel.
export const dynamic = "force-dynamic"

/**
 * Envoi MANUEL d'un unique SMS de test via AllMySMS.
 *
 * Sécurité : protégé par le même secret que le cron (`CRON_SECRET`), passé en
 * `Authorization: Bearer <CRON_SECRET>`. Aucune donnée tenant, aucun crédit
 * débité. Le numéro de destination est fourni dans le corps de la requête
 * (jamais codé en dur). N'est JAMAIS déclenché automatiquement (build / deploy
 * / migration) : il faut appeler cette route explicitement.
 *
 * Exemple :
 *   curl -X POST https://<domaine>/api/admin/sms-test \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"to":"+33612345678"}'
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  // On EXIGE un secret configuré : sans lui, la route est fermée.
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 })
  }

  let to = ""
  try {
    const body = (await request.json()) as { to?: string }
    to = (body?.to || "").trim()
  } catch {
    return NextResponse.json({ ok: false, error: "Corps JSON invalide" }, { status: 400 })
  }

  if (!to) {
    return NextResponse.json({ ok: false, error: "Champ 'to' requis." }, { status: 400 })
  }

  const result = await sendSms({
    to,
    message: "DetailFlow : votre service SMS est correctement configuré.",
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
