/**
 * Grant mensuel + transfert AllMySMS du delta, sans I/O direct (deps injectées).
 *
 * - `allocate` = allocateDeltaToTenant : seule source d'idempotence (delta
 *   granted+purchased − déjà alloué), donc un rejeu ne transfère jamais deux fois.
 * - Pas de sous-compte => cas normal avant activation : aucun appel, aucun crash.
 *   Les crédits restent en attente et seront transférés à l'activation.
 * - Échec AllMySMS => le solde DetailFlow n'est jamais modifié ici.
 */
export type MonthlyGrantAllocDeps = {
  grant: (companyId: number) => Promise<boolean>
  hasSubAccount: (companyId: number) => Promise<boolean>
  allocate: (companyId: number) => Promise<{ ok: boolean; error?: string }>
}

export async function grantMonthlyAndAllocate(
  companyId: number,
  deps: MonthlyGrantAllocDeps,
): Promise<{ granted: boolean; allocated: boolean }> {
  const granted = await deps.grant(companyId)
  if (!granted) return { granted, allocated: false }
  try {
    if (!(await deps.hasSubAccount(companyId))) return { granted, allocated: false }
    const res = await deps.allocate(companyId)
    if (!res.ok) console.error("[sms] allocation delta échouée:", companyId, res.error ?? "erreur inconnue")
    return { granted, allocated: res.ok }
  } catch (e) {
    console.error("[sms] allocation delta échouée:", companyId, e instanceof Error ? e.message : e)
    return { granted, allocated: false }
  }
}
