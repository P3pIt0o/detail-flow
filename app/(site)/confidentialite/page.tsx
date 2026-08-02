import type { Metadata } from "next"
import { legalConfig } from "@/config/legal"
import { PageHeader } from "@/components/layout/page-header"
import { LegalContent } from "@/components/layout/legal-content"
import { getCurrentTenant } from "@/lib/tenant"
import { getPublicContact } from "@/lib/public-contact"

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Politique de confidentialité et gestion des données personnelles.",
  alternates: { canonical: "/confidentialite" },
  robots: { index: false, follow: true },
}

export default async function ConfidentialitePage() {
  // Coordonnées réelles du tenant (aucune donnée statique). Repli sur la config
  // DetailFlow uniquement sur la vitrine racine (aucun tenant).
  const tenant = await getCurrentTenant()
  const contact = await getPublicContact()
  const companyName = tenant ? contact.name ?? tenant.name : legalConfig.companyName
  const email = tenant ? contact.email : null

  return (
    <>
      <PageHeader
        title="Politique de confidentialité"
        description={`Dernière mise à jour : ${legalConfig.lastUpdated}`}
      />
      <LegalContent>
        <p>
          {companyName} accorde une grande importance à la protection de vos données personnelles,
          conformément au Règlement Général sur la Protection des Données (RGPD).
        </p>

        <h2>Données collectées</h2>
        <p>Dans le cadre de nos services, nous pouvons collecter les données suivantes :</p>
        <ul>
          <li>Nom et prénom</li>
          <li>Adresse email et numéro de téléphone</li>
          <li>Adresse postale (pour les prestations à domicile)</li>
          <li>Informations relatives à votre véhicule et à vos réservations</li>
        </ul>

        <h2>Finalités du traitement</h2>
        <p>Vos données sont utilisées pour :</p>
        <ul>
          <li>Gérer vos demandes de contact et vos réservations</li>
          <li>Vous envoyer les confirmations et rappels de rendez-vous</li>
          <li>Calculer les frais de déplacement liés à votre adresse</li>
          <li>Améliorer nos services</li>
        </ul>

        <h2>Conservation des données</h2>
        <p>
          Vos données sont conservées pendant la durée nécessaire aux finalités décrites, puis archivées ou supprimées
          conformément aux obligations légales.
        </p>

        <h2>Vos droits</h2>
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement et d&apos;opposition sur vos
          données.
          {email ? (
            <>
              {" "}
              Pour l&apos;exercer, contactez-nous à <a href={`mailto:${email}`}>{email}</a>.
            </>
          ) : (
            " Pour l'exercer, contactez-nous par les moyens indiqués sur la page Contact."
          )}
        </p>

        <h2>Cookies</h2>
        <p>
          Ce site utilise uniquement des cookies techniques et de mesure d&apos;audience anonymisée. Aucun cookie
          publicitaire tiers n&apos;est déposé sans votre consentement.
        </p>
      </LegalContent>
    </>
  )
}
