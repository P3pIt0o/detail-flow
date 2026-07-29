export function withTenant(href: string, tenant: string | null): string {
  if (!tenant || !href.startsWith("/")) {
    return href
  }

  const separator = href.includes("?") ? "&" : "?"
  return `${href}${separator}tenant=${encodeURIComponent(tenant)}`
}
