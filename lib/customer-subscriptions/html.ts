/** Échappement HTML serveur : TOUTE valeur client/tenant interpolée dans un email passe ici. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** N'accepte qu'une URL https (ou http localhost hors prod) construite côté serveur. */
export function safeHref(url: string, allowLocalhost = process.env.NODE_ENV !== "production"): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return "#"
  }
  if (parsed.username || parsed.password) return "#"
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
  if (parsed.protocol === "https:" || (allowLocalhost && local && parsed.protocol === "http:")) return escapeHtml(parsed.toString())
  return "#"
}
