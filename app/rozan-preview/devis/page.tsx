import { RozanSiteShell } from "@/components/custom-sites/rozan/site-shell"
import { RozanDevis } from "@/components/custom-sites/rozan/rozan-devis"
import { ROZAN_SECTIONS, type RozanNavItem } from "@/components/custom-sites/rozan/tokens"
import { ROZAN_BRAND } from "@/components/custom-sites/rozan/content"

const NAV: RozanNavItem[] = [
  { id: "p", label: "Prestations", route: `/#${ROZAN_SECTIONS.prestations}` },
  { id: "a", label: "Avant / Après", route: `/#${ROZAN_SECTIONS.avantApres}` },
  { id: "z", label: "Zones d'intervention", route: `/#${ROZAN_SECTIONS.zones}` },
  { id: "v", label: "Avis", route: `/#${ROZAN_SECTIONS.avis}` },
  { id: "f", label: "FAQ", route: `/#${ROZAN_SECTIONS.faq}` },
]

// Aperçu isolé du formulaire de devis multi-étapes (mobile-first).
export default function RozanPreviewDevisPage() {
  return (
    <RozanSiteShell
      brandName={ROZAN_BRAND.name}
      navItems={NAV}
      ctaHref={`#${ROZAN_SECTIONS.devis}`}
      ctaLabel="Obtenir mon devis"
      phoneRaw={ROZAN_BRAND.phoneRaw}
      phoneLabel={ROZAN_BRAND.phone}
      stickyCtaHref={`#${ROZAN_SECTIONS.devis}`}
      stickyCtaLabel="Obtenir mon devis"
    >
      <RozanDevis />
    </RozanSiteShell>
  )
}
