import type { Metadata } from "next"
import { siteConfig, getFullAddress } from "@/config/site"
import { legalConfig } from "@/config/legal"
import { PageHeader } from "@/components/layout/page-header"
import { LegalContent } from "@/components/layout/legal-content"

export const metadata: Metadata = {
  title: "Mentions légales",
  description: `Mentions légales du site ${siteConfig.brand.name}.`,
  alternates: { canonical: "/mentions-legales" },
  robots: { index: false, follow: true },
}

export default function MentionsLegalesPage() {
  return (
    <>
      <PageHeader title="Mentions légales" description={`Dernière mise à jour : ${legalConfig.lastUpdated}`} />
      <LegalContent>
        <h2>Éditeur du site</h2>
        <p>
          <strong>{legalConfig.companyName}</strong>
          <br />
          {legalConfig.legalForm}
          <br />
          Siège social : {legalConfig.headquarters}
          <br />
          SIRET : {legalConfig.siret}
          <br />
          TVA intracommunautaire : {legalConfig.vat}
        </p>

        <h2>Directeur de la publication</h2>
        <p>{legalConfig.publicationDirector}</p>

        <h2>Contact</h2>
        <p>
          Téléphone : {siteConfig.contact.phone}
          <br />
          Email : {siteConfig.contact.email}
          <br />
          Adresse : {getFullAddress()}
        </p>

        <h2>Hébergement</h2>
        <p>
          Le site est hébergé par <strong>{legalConfig.host.name}</strong>
          <br />
          {legalConfig.host.address}
          <br />
          <a href={legalConfig.host.website} target="_blank" rel="noopener noreferrer">
            {legalConfig.host.website}
          </a>
        </p>

        <h2>Propriété intellectuelle</h2>
        <p>
          L&apos;ensemble des contenus (textes, images, logos) présents sur ce site est protégé par le droit
          d&apos;auteur. Toute reproduction, même partielle, sans autorisation écrite préalable est interdite.
        </p>

        <h2>Responsabilité</h2>
        <p>
          {siteConfig.brand.name} s&apos;efforce d&apos;assurer l&apos;exactitude des informations diffusées sur ce
          site mais ne saurait être tenu responsable des erreurs ou omissions éventuelles.
        </p>
      </LegalContent>
    </>
  )
}
