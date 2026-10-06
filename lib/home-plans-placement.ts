import type { HomeSectionKey } from "@/lib/site-content"

export const PLANS_SLOT = "plans" as const
export type HomeSlot = HomeSectionKey | typeof PLANS_SLOT

/**
 * Place le bloc « Formules d'entretien » une seule fois, juste après
 * « services ». Ordre des autres sections conservé tel quel.
 * Repli (ancienne config sans « services ») : avant customRequests/contact,
 * sinon en fin de liste.
 */
export function withPlansSlot(order: readonly HomeSectionKey[]): HomeSlot[] {
  const slots: HomeSlot[] = [...order]
  const servicesIndex = slots.indexOf("services")
  if (servicesIndex !== -1) {
    slots.splice(servicesIndex + 1, 0, PLANS_SLOT)
    return slots
  }
  const fallbackIndex = slots.findIndex((key) => key === "customRequests" || key === "contact")
  slots.splice(fallbackIndex === -1 ? slots.length : fallbackIndex, 0, PLANS_SLOT)
  return slots
}
