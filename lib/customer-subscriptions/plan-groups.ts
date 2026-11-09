/**
 * L36 — Regroupement PUBLIC des formules par catégorie de véhicule (fonctions pures).
 * Un groupe = au moins 2 formules publiques de même nom (sans casse ni espaces superflus)
 * ayant chacune une catégorie différente. Rien n'est masqué : une 2e formule de même nom
 * ET même catégorie reste une carte à part ; une formule sans catégorie ou seule de son
 * nom s'affiche comme avant.
 */

export type PlanVehicleTypeView = { label: string; rank: number }

type Groupable = { id: number; name: string; vehicleType?: PlanVehicleTypeView | null }

export type PlanGroupOption<P> = { label: string; rank: number; plan: P }

export type PlanCard<P> = { kind: "single"; plan: P } | { kind: "group"; key: string; options: PlanGroupOption<P>[] }

export function normalizePlanName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-FR")
}

/** Ordre d'entrée conservé : un groupe prend la position de sa première formule. */
export function groupPublicPlans<P extends Groupable>(plans: P[]): PlanCard<P>[] {
  const buckets = new Map<string, Map<number, P>>()
  for (const p of plans) {
    if (!p.vehicleType) continue
    const key = normalizePlanName(p.name)
    const byRank = buckets.get(key) ?? new Map<number, P>()
    if (!byRank.has(p.vehicleType.rank)) byRank.set(p.vehicleType.rank, p)
    buckets.set(key, byRank)
  }
  const grouped = new Set<number>()
  for (const byRank of buckets.values()) if (byRank.size >= 2) for (const p of byRank.values()) grouped.add(p.id)

  const cards: PlanCard<P>[] = []
  const emitted = new Set<string>()
  for (const p of plans) {
    if (!grouped.has(p.id)) {
      cards.push({ kind: "single", plan: p })
      continue
    }
    const key = normalizePlanName(p.name)
    if (emitted.has(key)) continue
    emitted.add(key)
    const options = [...buckets.get(key)!.values()]
      .map((plan) => ({ label: plan.vehicleType!.label, rank: plan.vehicleType!.rank, plan }))
      .sort((a, b) => a.rank - b.rank)
    cards.push({ kind: "group", key, options })
  }
  return cards
}

/** Choix partagé entre cartes : si la catégorie choisie manque au groupe, sa première option. */
export function selectedOption<P>(options: PlanGroupOption<P>[], selectedRank: number | null): PlanGroupOption<P> {
  return options.find((o) => o.rank === selectedRank) ?? options[0]
}

/** « Berline » → « berline » ; les sigles (« SUV ») restent tels quels. */
export function categorySuffix(label: string): string {
  return label === label.toLocaleUpperCase("fr-FR") ? label : label.toLocaleLowerCase("fr-FR")
}
