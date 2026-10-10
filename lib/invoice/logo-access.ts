export function ownsNewInvoiceLogo(
  pathname: string,
  companyId: number,
): boolean {
  if (!Number.isSafeInteger(companyId) || companyId <= 0)
    return false
  const prefix = "invoice-logo/" + companyId + "/"
  if (!pathname.startsWith(prefix)) return false
  const name = pathname.slice(prefix.length)
  return /^logo-[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/.test(name)
}

export function canReadInvoiceLogo(
  pathname: string | null,
  companyId: number,
  saved: string | null,
): boolean {
  if (!pathname) return false
  return pathname === saved ||
    ownsNewInvoiceLogo(pathname, companyId)
}

export function canChangeInvoiceLogo(
  requested: string | null,
  saved: string | null,
  companyId: number,
  enabled: boolean,
): boolean {
  if (requested === saved) return true
  if (!enabled) return false
  if (requested === null) return true
  return ownsNewInvoiceLogo(requested, companyId)
}
