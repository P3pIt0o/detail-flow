import { verifyOptOutToken, normalizeEmail } from "@/lib/notifications/opt-out-token"
import { recordReviewOptOut } from "@/lib/notifications/opt-out-store"

export const dynamic = "force-dynamic"

/**
 * Désinscription des demandes d'avis (lien présent dans l'email client).
 *
 * Le lien porte `c` (companyId), `e` (email) et `t` (jeton HMAC lié à
 * companyId + email normalisé). companyId/email ne sont acceptés que si la
 * signature est valide : impossible de cibler un autre tenant ou une autre adresse.
 *
 * GET  : AUCUNE écriture (les scanners antispam visitent les liens). Affiche une
 *        page de confirmation avec un bouton ; le formulaire n'a pas d'attribut
 *        `action` et poste donc vers la même URL (aucun jeton/email réécrit dans le HTML).
 * POST : revalide intégralement le HMAC, puis enregistre l'opposition (idempotent).
 *        Réponse identique que l'adresse soit déjà désinscrite ou non.
 *
 * Aucun script, aucun asset externe, aucune donnée sensible affichée, aucun log
 * du jeton ou de l'email.
 */

const OPT_OUT_BUTTON_LABEL = "Ne plus recevoir les demandes d’avis"
const SUCCESS_MESSAGE = "Votre préférence a bien été enregistrée."

const SECURITY_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
}

function page(title: string, body: string, status: number): Response {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;color:#0f172a;">
<main style="max-width:480px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;text-align:center;">
<h1 style="font-size:18px;margin:0 0 12px;">${title}</h1>
${body}
</main></body></html>`
  return new Response(html, { status, headers: SECURITY_HEADERS })
}

function paragraph(text: string): string {
  return `<p style="font-size:14px;line-height:1.6;color:#475569;margin:0;">${text}</p>`
}

function invalidLink(): Response {
  return page("Lien invalide", paragraph("Ce lien de désinscription est incomplet ou n’a pas pu être vérifié."), 400)
}

type ParsedLink = { companyId: number; email: string }

/** Vérifie la forme ET la signature. Aucune écriture, aucun log. */
function parseSignedLink(url: URL): ParsedLink | null {
  const companyId = Number(url.searchParams.get("c"))
  const email = normalizeEmail(url.searchParams.get("e"))
  const token = url.searchParams.get("t")
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || !Number.isInteger(companyId) || companyId <= 0 || !email || !token) return null
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null
  if (!verifyOptOutToken(companyId, email, token, secret)) return null
  return { companyId, email }
}

export async function GET(request: Request) {
  if (!parseSignedLink(new URL(request.url))) return invalidLink()
  return page(
    "Demandes d’avis",
    `${paragraph("Confirmez que vous ne souhaitez plus recevoir de demandes d’avis de la part de ce professionnel.")}
<form method="post" style="margin-top:20px;">
<button type="submit" style="min-height:44px;padding:10px 20px;border:0;border-radius:999px;background:#0f172a;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">${OPT_OUT_BUTTON_LABEL}</button>
</form>`,
    200,
  )
}

export async function POST(request: Request) {
  const link = parseSignedLink(new URL(request.url))
  if (!link) return invalidLink()
  const res = await recordReviewOptOut(link.companyId, link.email)
  if (!res.ok) {
    return page("Enregistrement impossible", paragraph("Votre demande n’a pas pu être enregistrée. Réessayez plus tard."), 503)
  }
  return page("Préférence enregistrée", paragraph(SUCCESS_MESSAGE), 200)
}
