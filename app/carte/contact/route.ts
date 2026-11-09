import { loadPublicDigitalCard } from "@/lib/digital-card.server"

export const dynamic = "force-dynamic"

/** vCard du tenant de la requête (L45). Sans extension dans l'URL : le middleware ignore les chemins à point. */
export async function GET() {
  const data = await loadPublicDigitalCard()
  if (!data) return new Response("Introuvable", { status: 404, headers: { "Cache-Control": "no-store" } })
  const filename = data.slug.replace(/[^a-z0-9-]/gi, "") || "contact"
  return new Response(data.vcard, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.vcf"`,
      "Cache-Control": "no-store",
    },
  })
}
