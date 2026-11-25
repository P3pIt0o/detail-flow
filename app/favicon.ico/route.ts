import { readFile } from "node:fs/promises"
import path from "node:path"
import { resolveCustomDomainSlug } from "@/lib/tenant-shared"

/**
 * `/favicon.ico` par hôte. Les navigateurs et Google le demandent à la racine,
 * sans tenant : on le déduit du domaine personnalisé (table fermée). Un hôte
 * inconnu ou la plateforme reçoit l'icône DetailFlow. L'hôte n'est jamais
 * recopié dans la réponse.
 */
const ICON_BY_SLUG: Record<string, string> = {
  "spirit-acs": "public/custom-sites/spirit-acs/icon.png",
  cleanyzer: "public/custom-sites/cleanyzer/icon.png",
}
const DEFAULT_ICON = "public/icons/icon-192.png"

function iconPathForHost(host: string | null | undefined): string {
  const clean = (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "")
  const slug = resolveCustomDomainSlug(clean)
  return (slug && ICON_BY_SLUG[slug]) || DEFAULT_ICON
}

export async function GET(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const file = iconPathForHost(host)
  const body = await readFile(path.join(process.cwd(), file))
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      Vary: "Host, X-Forwarded-Host",
    },
  })
}
