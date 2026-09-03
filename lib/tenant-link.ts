export function withTenant(href: string, tenant: string | null): string {
  if (!tenant || !href.startsWith("/")) {
    return href
  }

  // Insère `tenant=` AVANT un éventuel fragment d'ancre (« #demande-devis ») :
  // sinon le paramètre atterrirait après le « # » et serait ignoré. Sans ancre,
  // le comportement est strictement identique à l'historique.
  const hashIndex = href.indexOf("#")
  const path = hashIndex >= 0 ? href.slice(0, hashIndex) : href
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : ""
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}tenant=${encodeURIComponent(tenant)}${hash}`
}
