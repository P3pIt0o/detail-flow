type RolloutEnv = {
  FACTURX_INVOICES_ENABLED?: string
  FACTURX_PILOT_COMPANY_IDS?: string
}

export function canUseFacturX(
  companyId: number,
  env: RolloutEnv = { FACTURX_INVOICES_ENABLED: process.env.FACTURX_INVOICES_ENABLED, FACTURX_PILOT_COMPANY_IDS: process.env.FACTURX_PILOT_COMPANY_IDS }
): boolean {
  if (env.FACTURX_INVOICES_ENABLED !== "true") {
    return false
  }

  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    return false
  }

  const ids = env.FACTURX_PILOT_COMPANY_IDS ?? ""

  return ids.split(",").some((value) => {
    const id = value.trim()
    return /^[1-9]\d*$/.test(id) && Number(id) === companyId
  })
}
