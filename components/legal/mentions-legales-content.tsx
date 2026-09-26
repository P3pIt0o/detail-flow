import { legalConfig, legalEditorName } from "@/config/legal"
import { PageHeader } from "@/components/layout/page-header"
import { LegalContent } from "@/components/layout/legal-content"

/**
 * MENTIONS LÉGALES — DetailFlow (exploitant : entreprise individuelle, Genève).
 *
 * Contenu CANONIQUE, alimenté uniquement par `config/legal.ts`. Les lignes dont
 * l'information n'est pas encore connue (nom légal du titulaire, IDE, TVA) sont
 * masquées tant que la donnée est `null` — jamais de placeholder public.
 */
export function MentionsLegalesContent() {
  return (
    <>
      <PageHeader
        eyebrow="Informations légales"
        title="Mentions légales"
        description={`Dernière mise à jour : ${legalConfig.lastUpdated}`}
      />
      <LegalContent>
        <h2>Éditeur du service</h2>
        <p>
          Le service <strong>{legalConfig.brandName}</strong> est édité et exploité par{" "}
          <strong>{legalEditorName}</strong>, {legalConfig.legalForm.toLowerCase()}.
          <br />
          {legalConfig.legalBusinessName && (
            <>
              Titulaire : {legalConfig.legalBusinessName}
              <br />
            </>
          )}
          Adresse : {legalConfig.addressLine}
          <br />
          Email : <a href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a>
          <br />
          Site :{" "}
          <a href={legalConfig.website} target="_blank" rel="noopener noreferrer">
            {legalConfig.websiteLabel}
          </a>
          {legalConfig.ideNumber && (
            <>
              <br />
              IDE / UID : {legalConfig.ideNumber}
            </>
          )}
          {legalConfig.vatNumber && (
            <>
              <br />
              N° TVA : {legalConfig.vatNumber}
            </>
          )}
        </p>

        <h2>Responsable de la publication</h2>
        <p>
          {legalConfig.publicationDirector
            ? legalConfig.publicationDirector
            : `Le responsable de la publication est le titulaire de l'entreprise individuelle exploitant ${legalConfig.brandName}.`}{" "}
          Pour toute demande, écrivez à <a href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a>.
        </p>

        <h2>Conception, développement et gestion technique</h2>
        <p>
          Conception, développement et gestion technique : <strong>{legalConfig.technicalManager.name}</strong> —{" "}
          {legalConfig.technicalManager.role.toLowerCase()} basée à {legalConfig.technicalManager.city}.
          <br />
          {legalConfig.technicalManager.address}
          <br />
          <a href={legalConfig.technicalManager.website} target="_blank" rel="noopener noreferrer">
            {legalConfig.technicalManager.websiteLabel}
          </a>
        </p>

        <h2>Hébergement</h2>
        <p>
          Le service est hébergé par <strong>{legalConfig.host.name}</strong>
          <br />
          {legalConfig.host.address}
          <br />
          IDE : {legalConfig.host.ide}
          <br />
          <a href={legalConfig.host.website} target="_blank" rel="noopener noreferrer">
            {legalConfig.host.websiteLabel}
          </a>
        </p>
        <p>
          Certains prestataires techniques peuvent traiter des données pour le fonctionnement du service. Ils sont
          présentés dans la <a href="/confidentialite">politique de confidentialité</a>.
        </p>

        <h2>Propriété intellectuelle</h2>
        <p>
          La marque, le nom {legalConfig.brandName}, le design, les textes, les interfaces, les composants, le logiciel
          et les éléments graphiques du service sont protégés dans les limites des droits applicables. Toute
          reproduction, représentation, modification ou réutilisation, totale ou partielle, sans autorisation écrite
          préalable, est interdite.
        </p>
        <p>
          Cette protection ne s&apos;étend pas aux contenus appartenant aux utilisateurs ou à des tiers. Les
          utilisateurs restent titulaires des droits sur leurs propres contenus (voir les{" "}
          <a href="/conditions">conditions générales</a>).
        </p>

        <h2>Responsabilité</h2>
        <p>
          {legalConfig.brandName} s&apos;efforce d&apos;assurer l&apos;exactitude des informations diffusées sur ce
          site, sans garantir qu&apos;elles soient exemptes d&apos;erreurs ou d&apos;omissions. Le service peut être
          temporairement indisponible pour des raisons de maintenance, de sécurité ou du fait de prestataires tiers.
        </p>

        <h2>Liens externes</h2>
        <p>
          Ce site peut contenir des liens vers des sites tiers. {legalConfig.brandName} n&apos;exerce aucun contrôle
          sur ces sites et décline toute responsabilité quant à leur contenu ou à leurs pratiques.
        </p>

        <h2>Disponibilité des informations</h2>
        <p>
          Les présentes informations peuvent être mises à jour à tout moment. La date de dernière mise à jour est
          indiquée en haut de cette page.
        </p>

        <h2>Droit applicable</h2>
        <p>
          Sauf disposition légale impérative contraire, les présentes mentions sont régies par le droit suisse. Les
          rapports contractuels avec les utilisateurs professionnels sont précisés dans les{" "}
          <a href="/conditions">conditions générales</a>.
        </p>
      </LegalContent>
    </>
  )
}
