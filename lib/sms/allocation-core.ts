/**
 * Grant mensuel + transfert AllMySMS du delta, sans I/O direct (deps injectées).
 *
 * - `allocate` = allocateDeltaToTenant : seule source d'idempotence (delta
 *   granted+purchased − déjà alloué), donc un rejeu ne transfère jamais deux fois.
 * - L'allocation est tentée à CHAQUE passage (grant nouveau ou non) : un delta
 *   resté en attente après un échec AllMySMS est retenté le lendemain.
 * - Pas de sous-compte => cas normal avant activation : aucun appel, aucun crash.
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

/** Clé advisory lock (classid) des allocations SMS ; objid = companyId. */
export const SMS_ALLOCATION_LOCK_CLASS = 0x534d53

export type SerializedAllocDeps = {
  /** Exécute `fn` sous verrou exclusif par tenant (pg_advisory_xact_lock). */
  withTenantLock: <T>(companyId: number, fn: () => Promise<T>) => Promise<T>
  readTotals: (companyId: number) => Promise<{ granted: number; purchased: number; allocated: number }>
  /** Transfert AllMySMS ; persiste allmysmsCreditsAllocated en cas de succès. */
  transfer: (companyId: number, quantity: number) => Promise<{ ok: boolean; allocated: number; error?: string }>
}

export type SerializedAllocResult = {
  ok: boolean
  allocated: number
  delta: number
  totalGranted: number
  alreadyAllocated: number
  error?: string
}

/** Delta relu et transféré APRÈS acquisition du verrou : deux appels concurrents ne transfèrent jamais deux fois. */
export function allocateDeltaSerialized(companyId: number, deps: SerializedAllocDeps): Promise<SerializedAllocResult> {
  return deps.withTenantLock(companyId, async () => {
    const t = await deps.readTotals(companyId)
    const totalGranted = t.granted + t.purchased
    const alreadyAllocated = t.allocated
    const delta = totalGranted - alreadyAllocated
    if (delta <= 0) return { ok: true, allocated: 0, delta: 0, totalGranted, alreadyAllocated }
    const r = await deps.transfer(companyId, delta)
    return { ok: r.ok, allocated: r.allocated, delta, totalGranted, alreadyAllocated, error: r.error }
  })
}
