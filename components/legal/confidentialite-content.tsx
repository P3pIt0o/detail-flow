import { legalConfig, legalEditorName, DATA_PROCESSORS } from "@/config/legal"
import { PageHeader } from "@/components/layout/page-header"
import { LegalContent } from "@/components/layout/legal-content"

/**
 * POLITIQUE DE CONFIDENTIALITÉ — DetailFlow.
 *
 * Rédigée d'abord selon la LPD suisse (exploitant à Genève), avec prise en
 * compte du RGPD lorsque la réglementation européenne est applicable. Les
 * prestataires listés proviennent de l'audit réel (`DATA_PROCESSORS`).
 */
export function ConfidentialiteContent() {
  return (
    <>
      <PageHeader
        eyebrow="Vos données"
        title="Politique de confidentialité"
        description={`Dernière mise à jour : ${legalConfig.lastUpdated}`}
      />
      <LegalContent>
        <p>
          La présente politique explique comment {legalConfig.brandName} traite les données personnelles. Elle est
          établie conformément à la loi fédérale suisse sur la protection des données (LPD). Lorsque la réglementation
          européenne sur la protection des données (RGPD) est applicable, elle est prise en compte pour les personnes
          concernées situées dans l&apos;Union européenne / l&apos;EEE.
        </p>

        <h2>1. Responsable du traitement</h2>
        <p>
          Pour les traitements dont il détermine les finalités (notamment les comptes professionnels et la gestion du
          service), le responsable du traitement est {legalEditorName}, exploitant de {legalConfig.brandName} :
          <br />
          {legalConfig.addressLine}
          <br />
          Contact protection des données : <a href={`mailto:${legalConfig.privacyContact}`}>
            {legalConfig.privacyContact}
          </a>
        </p>
        <p>
          Aucun délégué à la protection des données (DPO) n&apos;a été désigné à ce jour ; les demandes sont traitées
          via l&apos;adresse ci-dessus.
        </p>

        <h2>2. Rôles : responsable de traitement et sous-traitant</h2>
        <p>
          Le rôle de {legalConfig.brandName} dépend du traitement concerné :
        </p>
        <ul>
          <li>
            <strong>Responsable du traitement</strong> — pour les données des comptes professionnels utilisateurs et le
            fonctionnement de la Plateforme.
          </li>
          <li>
            <strong>Sous-traitant</strong> — pour les données que le professionnel enregistre au sujet de ses propres
            clients. Dans ce cas, le professionnel utilisateur reste responsable du traitement et détermine les
            finalités ; {legalConfig.brandName} fournit l&apos;outil technique et agit sur ses instructions.
          </li>
        </ul>

        <h2>3. Données du compte professionnel</h2>
        <p>Lorsqu&apos;elles sont réellement nécessaires, nous traitons notamment :</p>
        <ul>
          <li>identité et coordonnées (nom, prénom, email, téléphone) ;</li>
          <li>informations sur l&apos;entreprise et son activité ;</li>
          <li>données de compte et d&apos;abonnement ;</li>
          <li>paramètres, préférences et historique d&apos;utilisation ;</li>
          <li>données de facturation ;</li>
          <li>échanges avec le support ;</li>
          <li>données techniques et journaux de sécurité (logs).</li>
        </ul>

        <h2>4. Données des clients des professionnels</h2>
        <p>
          Pour le compte du professionnel utilisateur, la Plateforme peut traiter des données concernant ses propres
          clients, par exemple : nom, email, téléphone, véhicule, réservations, prestations, devis, factures, références
          de paiement, messages et, lorsque la fonction existe, photographies. Le professionnel est responsable de ces
          traitements et de disposer d&apos;un fondement approprié.
        </p>

        <h2>5. Demandes via les formulaires publics</h2>
        <p>
          Le formulaire de contact et le questionnaire « site sur mesure » collectent les informations que vous
          transmettez : entreprise, prénom, email, téléphone, site existant, nom de domaine, système de réservation
          actuel, besoins, fonctionnalités souhaitées et commentaire libre. Ces informations sont utilisées pour
          étudier votre demande et vous proposer un devis. Le questionnaire « site sur mesure » envoie actuellement un
          récapitulatif par email à {legalConfig.email} ; il ne crée pas de fiche CRM et ne stocke pas ces réponses dans
          une base de données dédiée.
        </p>

        <h2>6. Finalités et fondements</h2>
        <ul>
          <li>fournir et administrer le service (exécution du contrat / des mesures précontractuelles) ;</li>
          <li>gérer les réservations, confirmations et rappels ;</li>
          <li>traiter les paiements et la facturation (obligation légale et exécution du contrat) ;</li>
          <li>calculer les frais de déplacement à partir d&apos;une adresse ;</li>
          <li>assurer la sécurité, prévenir les abus et améliorer le service (intérêt légitime) ;</li>
          <li>répondre aux demandes de contact et de devis.</li>
        </ul>

        <h2>7. Destinataires et prestataires</h2>
        <p>
          Les données ne sont accessibles qu&apos;aux personnes habilitées et à des prestataires techniques agissant
          pour notre compte. Les principaux prestataires réellement utilisés sont :
        </p>
        <div className="not-prose my-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-4 font-semibold">Prestataire</th>
                <th className="py-2 pr-4 font-semibold">Finalité</th>
                <th className="py-2 font-semibold">Localisation</th>
              </tr>
            </thead>
            <tbody>
              {DATA_PROCESSORS.map((p) => (
                <tr key={p.name} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-4 font-medium text-foreground">{p.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.purpose}</td>
                  <td className="py-2 text-muted-foreground">{p.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>8. Hébergement et transferts</h2>
        <p>
          L&apos;hébergement principal est assuré par {legalConfig.host.name} en Suisse. Certains prestataires
          ci-dessus peuvent toutefois traiter des données en dehors de la Suisse, y compris dans l&apos;Union
          européenne ou hors UE/EEE. Lorsqu&apos;un transfert vers un pays tiers a lieu, il est encadré par des
          garanties appropriées prévues par la réglementation applicable (clauses contractuelles types, décisions
          d&apos;adéquation ou mécanismes équivalents), selon les modalités propres à chaque prestataire.
        </p>

        <h2>9. Durées de conservation</h2>
        <p>
          Les données sont conservées le temps nécessaire aux finalités décrites, puis supprimées ou anonymisées :
        </p>
        <ul>
          <li>données de compte et contenus : pendant la durée d&apos;utilisation du service, puis suppression dans un délai raisonnable après la fermeture du compte ;</li>
          <li>données de facturation : pendant la durée imposée par les obligations légales comptables et fiscales applicables ;</li>
          <li>journaux techniques et de sécurité : durée courte, adaptée à la finalité de sécurité ;</li>
          <li>demandes de contact et de devis : le temps nécessaire au traitement de la demande et à un suivi raisonnable.</li>
        </ul>
        <p>
          Certaines durées précises restent à finaliser et seront ajustées selon les obligations légales applicables et
          la configuration du produit.
        </p>

        <h2>10. Vos droits</h2>
        <p>Selon la réglementation applicable, vous disposez notamment des droits suivants :</p>
        <ul>
          <li>accès à vos données ;</li>
          <li>rectification ;</li>
          <li>effacement, lorsque cela est applicable ;</li>
          <li>limitation du traitement, lorsque cela est applicable ;</li>
          <li>opposition, lorsque cela est applicable ;</li>
          <li>portabilité, lorsque cela est applicable ;</li>
          <li>retrait du consentement, lorsqu&apos;un traitement repose sur celui-ci.</li>
        </ul>
        <p>
          Pour exercer ces droits, écrivez à <a href={`mailto:${legalConfig.privacyContact}`}>
            {legalConfig.privacyContact}
          </a>
          . Lorsque vos données sont traitées par un professionnel utilisateur (ses propres clients), adressez-vous
          d&apos;abord à ce professionnel, responsable du traitement.
        </p>

        <h2>11. Cookies et traceurs</h2>
        <p>
          Le service utilise uniquement des cookies strictement nécessaires et une mesure d&apos;audience agrégée sans
          cookie. Le détail figure sur la page <a href="/cookies">Cookies</a>.
        </p>

        <h2>12. Sécurité</h2>
        <p>
          {legalConfig.brandName} met en œuvre des mesures techniques et organisationnelles adaptées pour protéger les
          données. Aucune méthode de transmission ou de stockage n&apos;étant totalement infaillible, une sécurité
          absolue ne peut être garantie.
        </p>

        <h2>13. Communications</h2>
        <p>
          Les emails transactionnels (confirmations, rappels, notifications de service) sont nécessaires au
          fonctionnement du service et ne constituent pas une autorisation de prospection commerciale. Aucune
          newsletter marketing n&apos;est envoyée sans une base appropriée.
        </p>

        <h2>14. Mise à jour</h2>
        <p>
          La présente politique peut être mise à jour. La date de dernière mise à jour figure en haut de cette page.
        </p>
      </LegalContent>
    </>
  )
}
