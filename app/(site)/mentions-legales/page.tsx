import type { Metadata } from "next"
import { legalConfig } from "@/config/legal"
import { PageHeader } from "@/components/layout/page-header"
import { LegalContent } from "@/components/layout/legal-content"
import { getCurrentTenant } from "@/lib/tenant"
import { getPublicContact } from "@/lib/public-contact"

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales du site.",
  alternates: { canonical: "/mentions-legales" },
  robots: { index: false, follow: true },
}

export default async function MentionsLegalesPage() {
  // ISOLATION : les informations éditeur proviennent de l'entreprise résolue.
  // Source de vérité = coordonnées enregistrées dans les paramètres du tenant
  // (getPublicContact → table settings). Aucune donnée statique / de démo.
  // Sur la vitrine racine (aucun tenant), repli sur la configuration DetailFlow.
  const tenant = await getCurrentTenant()
  const contact = await getPublicContact()

  const editorName = tenant ? contact.name ?? tenant.name : legalConfig.companyName
  const phone = tenant ? contact.phone : null
  const email = tenant ? contact.email : null
  const address = tenant ? contact.address : null
  const website = contact.website

  return (
    <>
      <PageHeader title="Mentions légales" description={`Dernière mise à jour : ${legalConfig.lastUpdated}`} />
      <LegalContent>
        <h2>Éditeur du site</h2>
        <p>
          <strong>{editorName}</strong>
          {!tenant && (
            <>
              <br />
              {legalConfig.legalForm}
              <br />
              Siège social : {legalConfig.headquarters}
              <br />
              SIRET : {legalConfig.siret}
              <br />
              TVA intracommunautaire : {legalConfig.vat}
            </>
          )}
        </p>

        <h2>Contact</h2>
        <p>
          {phone && (
            <>
              Téléphone : {phone}
              <br />
            </>
          )}
          {email && (
            <>
              Email : {email}
              <br />
            </>
          )}
          {address && <>Adresse : {address}</>}
          {website && (
            <>
              <br />
              Site web :{" "}
              <a href={website} target="_blank" rel="noopener noreferrer">
                {website}
              </a>
            </>
          )}
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

        <h2>Conception et développement</h2>
        <p>
          Le site a été conçu et développé par <strong>{legalConfig.developer.name}</strong>
          <br />
          {legalConfig.developer.address}
          <br />
          Contact : <a href={`mailto:${legalConfig.developer.contact}`}>{legalConfig.developer.contact}</a>
        </p>

        <h2>Propriété intellectuelle</h2>
        <p>
          L&apos;ensemble des contenus (textes, images, logos) présents sur ce site est protégé par le droit
          d&apos;auteur. Toute reproduction, même partielle, sans autorisation écrite préalable est interdite.
        </p>

        <h2>Responsabilité</h2>
        <p>
          {editorName} s&apos;efforce d&apos;assurer l&apos;exactitude des informations diffusées sur ce site mais ne
          saurait être tenu responsable des erreurs ou omissions éventuelles.
        </p>
      </LegalContent>
    </>
  )
}
