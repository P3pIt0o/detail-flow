/**
 * Politique d'accès aux logos de facturation (Blob privé).
 *
 * Un pathname n'est JAMAIS approuvé parce que le navigateur le fournit. Il est
 * accepté uniquement s'il appartient au tenant courant :
 *  - soit c'est EXACTEMENT le logo déjà enregistré dans les settings de ce
 *    tenant (compatibilité avec les anciens logos `invoice-logo/logo-…`) ;
 *  - soit il est rangé dans le namespace strict du tenant
 *    `invoice-logo/{companyId}/…` (nouveaux uploads).
 */

const MAX_PATHNAME_LENGTH = 512

export function tenantLogoPrefix(companyId: number): string {
  return `invoice-logo/${companyId}/`
}

function isWellFormedPathname(pathname: string): boolean {
  if (pathname.length === 0 || pathname.length > MAX_PATHNAME_LENGTH) return false
  if (pathname.startsWith("/") || pathname.includes("\\") || pathname.includes("..")) return false
  if (/[\u0000-\u001f?#]/.test(pathname)) return false
  return true
}

export function isAllowedTenantLogoPathname(
  pathname: unknown,
  companyId: number,
  storedPathname: string | null | undefined,
): boolean {
  if (typeof pathname !== "string" || !Number.isInteger(companyId) || companyId <= 0) return false
  if (!isWellFormedPathname(pathname)) return false
  if (storedPathname && pathname === storedPathname) return true
  const prefix = tenantLogoPrefix(companyId)
  return pathname.startsWith(prefix) && pathname.length > prefix.length && !pathname.slice(prefix.length).includes("/")
}

/** Extension de fichier sûre pour la clé Blob (jamais de séparateur ni de caractère exotique). */
export function safeLogoExtension(fileName: string): string {
  const raw = fileName.includes(".") ? fileName.split(".").pop() ?? "" : ""
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)
  return ext || "png"
}
