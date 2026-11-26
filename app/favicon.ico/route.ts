import { readFile } from "node:fs/promises"
import path from "node:path"
import { resolveCustomDomainSlug } from "@/lib/tenant-shared"

/**
 * `/favicon.ico` par hôte. Les navigateurs et Google le demandent à la racine,
 * sans tenant : on le déduit du domaine personnalisé (table fermée). Seul Spirit
 * ACS est servi ici ; un autre domaine personnalisé garde son comportement
 * actuel (404). Un hôte inconnu ou la plateforme reçoit l'icône DetailFlow.
 * L'hôte n'est jamais recopié dans la réponse.
 */
const ICON_BY_SLUG: Record<string, string> = {
  "spirit-acs": "/custom-sites/spirit-acs/icon.png",
}
const DEFAULT_ICON = "/icons/icon-192.png"

function iconForHost(host: string | null | undefined): string | null {
  const clean = (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "")
  const slug = resolveCustomDomainSlug(clean)
  if (!slug) return DEFAULT_ICON
  return ICON_BY_SLUG[slug] ?? null
}

export async function GET(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const icon = iconForHost(host)
  if (!icon) return new Response(null, { status: 404 })
  const headers = {
    "Cache-Control": "public, max-age=3600",
    Vary: "Host, X-Forwarded-Host",
  }
  try {
    const body = await readFile(path.join(process.cwd(), "public", icon))
    return new Response(new Uint8Array(body), { headers: { ...headers, "Content-Type": "image/png" } })
  } catch {
    // Fichier absent du bundle serveur : le fichier statique public/ est servi par le CDN.
    return new Response(null, { status: 307, headers: { ...headers, Location: icon } })
  }
}
