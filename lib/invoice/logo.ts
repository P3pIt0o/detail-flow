import { get } from "@vercel/blob"

/**
 * Récupère le logo (Blob privé) et le convertit en data URL utilisable par
 * @react-pdf/renderer. Renvoie null si absent ou en cas d'erreur (le PDF
 * bascule alors sur le nom de l'entreprise en texte).
 */
export async function getLogoDataUrl(pathname: string | null | undefined): Promise<string | null> {
  if (!pathname) return null
  try {
    const result = await get(pathname, { access: "private" })
    if (!result || !("stream" in result)) return null

    const reader = result.stream.getReader()
    const chunks: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const buffer = Buffer.concat(chunks)
    const contentType = result.blob.contentType || "image/png"
    return `data:${contentType};base64,${buffer.toString("base64")}`
  } catch {
    return null
  }
}
