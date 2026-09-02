// ROUTE TEMPORAIRE DE VÉRIFICATION (non commitée) : rend le hero Spirit + la
// section de réassurance sans dépendance à la base de données.
import { SpiritSiteShell } from "@/components/custom-sites/spirit-acs/site-shell"
import { SpiritHero } from "@/components/custom-sites/spirit-acs/spirit-hero"
import { SpiritReassurance } from "@/components/custom-sites/spirit-acs/spirit-reassurance"
import { SPIRIT_SECTIONS, SPIRIT_LOGO_FALLBACK } from "@/components/custom-sites/spirit-acs/tokens"

export default function Page() {
  return (
    <SpiritSiteShell
      brandName="Spirit ACS"
      logoSrc={SPIRIT_LOGO_FALLBACK}
      navItems={[
        { id: SPIRIT_SECTIONS.prestations, label: "Prestations" },
        { id: SPIRIT_SECTIONS.realisations, label: "Réalisations" },
        { id: SPIRIT_SECTIONS.apropos, label: "À propos" },
        { id: SPIRIT_SECTIONS.contact, label: "Contact" },
      ]}
      ctaHref={`#${SPIRIT_SECTIONS.demandeDevis}`}
      ctaLabel="Demander un devis"
      phone={null}
      phoneRaw={null}
      email={null}
      city="Lyon"
      footerTagline={null}
      immersive
    >
      <SpiritHero
        title={null}
        highlight={null}
        subtitle={null}
        quoteEnabled
        hasGallery
        city="Lyon"
        googleRating={5}
        googleUrl="https://maps.google.com"
      />
      <SpiritReassurance />
    </SpiritSiteShell>
  )
}
