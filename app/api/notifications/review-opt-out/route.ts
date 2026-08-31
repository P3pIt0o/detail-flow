import { verifyOptOutToken, normalizeEmail } from "@/lib/notifications/opt-out-token"
import { recordReviewOptOut } from "@/lib/notifications/opt-out-store"

export const dynamic = "force-dynamic"

/**
 * Désinscription des demandes d'avis (lien présent dans l'email client).
 *
 * Le lien porte `c` (companyId), `e` (email) et `t` (jeton HMAC). On NE fait
 * confiance qu'au jeton : `companyId`/email ne sont acceptés que si la
 * signature correspond (impossible de désinscrire l'email d'un tiers ou de
 * cibler un autre tenant). Réponse HTML sobre, sans donnée sensible.
 */
function page(title: string, message: string, ok: boolean): Response {
  const color = ok ? "#16a34a" : "#dc2626"
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;color:#0f172a;">
<div style="max-width:480px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;text-align:center;">
<div style="width:44px;height:44px;border-radius:50%;background:${color}1a;color:${color};font-size:24px;line-height:44px;margin:0 auto 16px;">${ok ? "✓" : "!"}</div>
<h1 style="font-size:18px;margin:0 0 8px;">${title}</h1>
<p style="font-size:14px;line-height:1.6;color:#64748b;margin:0;">${message}</p>
</div></body></html>`
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" },
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const companyId = Number(url.searchParams.get("c"))
  const email = normalizeEmail(url.searchParams.get("e"))
  const token = url.searchParams.get("t")
  const secret = process.env.BETTER_AUTH_SECRET

  if (!secret || !Number.isInteger(companyId) || companyId <= 0 || !email || !token) {
    return page("Lien invalide", "Ce lien de désinscription est incomplet ou invalide.", false)
  }
  if (!verifyOptOutToken(companyId, email, token, secret)) {
    return page("Lien invalide", "Ce lien de désinscription n'a pas pu être vérifié.", false)
  }

  const res = await recordReviewOptOut(companyId, email)
  if (!res.ok) {
    return page("Désinscription impossible", res.error ?? "Réessayez plus tard.", false)
  }
  return page(
    "Désinscription confirmée",
    res.alreadyOptedOut
      ? "Vous étiez déjà désinscrit des demandes d'avis. Aucun autre message ne vous sera envoyé."
      : "C'est noté : vous ne recevrez plus de demandes d'avis de cette entreprise.",
    true,
  )
}
