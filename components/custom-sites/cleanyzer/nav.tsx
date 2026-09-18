/**
 * Éléments de navigation CLEANYZER (cahier §3).
 * Prestations · Réalisations · À propos · Zone d'intervention · Questions fréquentes.
 */

import { CLZ_PREVIEW_BASE, CLZ_SECTIONS, type ClzNavItem } from "./tokens"

export const CLZ_NAV_ITEMS: ClzNavItem[] = [
  { id: CLZ_SECTIONS.prestations, label: "Prestations", href: `${CLZ_PREVIEW_BASE}#prestations` },
  { id: CLZ_SECTIONS.realisations, label: "Réalisations", href: `${CLZ_PREVIEW_BASE}/realisations` },
  { id: CLZ_SECTIONS.apropos, label: "À propos", href: `${CLZ_PREVIEW_BASE}/a-propos` },
  { id: CLZ_SECTIONS.zone, label: "Zone d'intervention", href: `${CLZ_PREVIEW_BASE}#zone` },
  { id: CLZ_SECTIONS.faq, label: "Questions fréquentes", href: `${CLZ_PREVIEW_BASE}/faq` },
]
