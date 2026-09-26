import { legalConfig } from "@/config/legal"
import { COMMERCIAL_PLANS } from "@/lib/pricing/plans"
import { PageHeader } from "@/components/layout/page-header"
import { LegalContent } from "@/components/layout/legal-content"

/**
 * CONDITIONS GÉNÉRALES — Plateforme DetailFlow (SaaS), envers les PROFESSIONNELS
 * utilisateurs. Contenu CANONIQUE partagé par la vitrine (/conditions) et la
 * route tenant historique. À NE PAS CONFONDRE avec les CGV d'un detailer envers
 * ses propres clients (route /cgv, texte libre par tenant).
 *
 * Les noms et prix des offres proviennent de la source de vérité commerciale
 * (`lib/pricing/plans.ts`) : aucun prix recopié à la main.
 */
export function ConditionsContent() {
  return (
    <>
      <PageHeader
        eyebrow="DetailFlow"
        title="Conditions générales d'utilisation et de vente"
        description={`Dernière mise à jour : ${legalConfig.lastUpdated}`}
      />
      <LegalContent>
        <p>
          Les présentes conditions générales encadrent l&apos;accès et l&apos;utilisation de la plateforme{" "}
          <strong>{legalConfig.brandName}</strong> (ci-après « la Plateforme ») par les professionnels du detailing
          automobile (ci-après « l&apos;Utilisateur »). La Plateforme est destinée à un usage professionnel. En créant
          un compte ou en utilisant la Plateforme, l&apos;Utilisateur accepte les présentes conditions.
        </p>

        <h2>1. Objet et description du service</h2>
        <p>
          {legalConfig.brandName} est un logiciel en ligne (SaaS) permettant aux professionnels du detailing de gérer
          leur activité : site de présentation, réservation en ligne, planning, fiches clients et véhicules, devis,
          facturation, paiements et notifications. La Plateforme fournit un outil technique et n&apos;intervient pas
          dans la relation commerciale entre l&apos;Utilisateur et ses propres clients.
        </p>

        <h2>2. Accès et création de compte</h2>
        <p>
          L&apos;accès nécessite la création d&apos;un compte avec une adresse email valide, qui doit être confirmée.
          L&apos;Utilisateur s&apos;engage à fournir des informations exactes et à les tenir à jour. Il est seul
          responsable de la confidentialité de ses identifiants et de toute activité réalisée depuis son compte, et
          doit informer {legalConfig.brandName} sans délai de tout usage non autorisé.
        </p>

        <h2>3. Offres, licences et disponibilité</h2>
        <p>
          {legalConfig.brandName} propose plusieurs formules, dont une formule gratuite et des formules payantes :
        </p>
        <ul>
          {COMMERCIAL_PLANS.map((plan) => (
            <li key={plan.id}>
              <strong>{plan.name}</strong> — {plan.price}
              {plan.period ? ` ${plan.period}` : ""} : {plan.description}
            </li>
          ))}
        </ul>
        <p>
          Chaque formule confère un droit d&apos;utilisation limité aux fonctionnalités réellement activées pour cette
          formule. Certaines fonctionnalités peuvent être présentées comme « bientôt disponibles » : elles ne sont ni
          garanties ni exigibles tant qu&apos;elles ne sont pas effectivement mises à disposition. Les prix et le détail
          des offres en vigueur sont présentés sur la <a href="/#tarifs">page tarifs</a>.
        </p>

        <h2>4. Services gratuits et payants</h2>
        <p>
          La formule gratuite est accessible sans engagement. Les formules payantes sont facturées selon la périodicité
          indiquée lors de la souscription. Aucun abonnement payant n&apos;est déclenché sans acceptation explicite de
          l&apos;offre correspondante par l&apos;Utilisateur.
        </p>

        <h2>5. Facturation et paiements</h2>
        <p>
          Les paiements en ligne (abonnements et, le cas échéant, encaissements liés aux réservations) sont traités par
          notre prestataire de paiement <strong>Stripe</strong>. Les données de paiement sensibles (numéro de carte
          complet notamment) sont traitées directement par le prestataire de paiement et ne transitent pas par les
          serveurs de {legalConfig.brandName}. Des frais propres au prestataire de paiement peuvent s&apos;appliquer
          distinctement.
        </p>
        <p>
          Lorsque {legalConfig.brandName} applique une commission sur certaines transactions, celle-ci est indiquée
          avant validation. Cette commission, lorsqu&apos;elle existe, est distincte des frais du prestataire de
          paiement.
        </p>

        <h2>6. SMS et services à coût variable</h2>
        <p>
          Certaines fonctionnalités reposent sur des services à coût variable (par exemple l&apos;envoi de SMS de
          rappel). Leur disponibilité et leurs éventuelles conditions de consommation sont précisées dans
          l&apos;offre ou dans l&apos;application. Ces services peuvent dépendre de prestataires tiers.
        </p>

        <h2>7. Services tiers</h2>
        <p>
          La Plateforme s&apos;appuie sur des prestataires tiers (hébergement, paiement, email, SMS, cartographie).
          {legalConfig.brandName} ne saurait être tenu responsable d&apos;une défaillance imputable exclusivement à un
          service tiers, sans préjudice de ses propres obligations. Ces prestataires sont décrits dans la{" "}
          <a href="/confidentialite">politique de confidentialité</a>.
        </p>

        <h2>8. Obligations et contenus de l&apos;Utilisateur</h2>
        <p>
          L&apos;Utilisateur est seul responsable de l&apos;exactitude des informations qu&apos;il saisit, des contenus
          et photographies qu&apos;il importe, ainsi que du respect des droits des tiers. Il garantit disposer d&apos;un
          fondement approprié pour traiter les données concernant ses propres clients. Il est seul responsable des
          prestations qu&apos;il vend et de la relation avec ses clients.
        </p>

        <h2>9. Propriété intellectuelle et propriété des données</h2>
        <p>
          La Plateforme, son code, sa marque, ses interfaces et ses composants sont la propriété de{" "}
          {legalConfig.brandName} et sont protégés par le droit applicable. L&apos;Utilisateur bénéficie d&apos;un droit
          d&apos;utilisation personnel, non exclusif et non cessible, limité à la durée de son accès. Il est interdit de
          copier, décompiler, revendre ou mettre à disposition de tiers tout ou partie du service sans autorisation
          écrite.
        </p>
        <p>
          L&apos;Utilisateur conserve l&apos;ensemble de ses droits sur les données et contenus qu&apos;il introduit
          dans la Plateforme. L&apos;utilisation de {legalConfig.brandName} n&apos;emporte aucun transfert de propriété
          de ses fichiers clients au bénéfice de {legalConfig.brandName}.
        </p>
        <p>
          {legalConfig.brandName} ne fait usage du nom, du logo, de captures ou de témoignages d&apos;un Utilisateur
          comme référence commerciale qu&apos;avec son autorisation ou sur une base contractuelle appropriée.
        </p>

        <h2>10. Prestation « site sur mesure » (distincte des abonnements)</h2>
        <p>
          Outre les abonnements SaaS, {legalConfig.brandName} propose une prestation distincte de création de site
          internet sur mesure, à partir de 790 €. Cette prestation n&apos;est pas une formule SaaS : le tarif « à partir
          de » s&apos;entend selon le périmètre et fait l&apos;objet d&apos;un devis personnalisé. Le délai de production
          annoncé (par exemple une première version sous 7 jours) court à compter de la validation du devis, de la
          réception des éléments nécessaires, de l&apos;éventuel acompte et de la validation du périmètre. Il peut
          varier selon la complexité du projet, les retours du client, les contenus transmis et les intégrations
          tierces.
        </p>

        <h2>11. Disponibilité et maintenance</h2>
        <p>
          {legalConfig.brandName} met en œuvre des moyens raisonnables pour assurer la disponibilité de la Plateforme,
          sans garantie d&apos;un taux de disponibilité déterminé en l&apos;absence d&apos;engagement de niveau de
          service (SLA) spécifique. Des opérations de maintenance, de sécurité ou des incidents, y compris chez des
          prestataires tiers, peuvent entraîner une indisponibilité temporaire.
        </p>

        <h2>12. Évolution des fonctionnalités</h2>
        <p>
          La Plateforme évolue régulièrement. {legalConfig.brandName} peut ajouter, modifier ou retirer des
          fonctionnalités afin d&apos;améliorer le service, sans que cela ne dénature substantiellement les
          fonctionnalités essentielles de la formule souscrite.
        </p>

        <h2>13. Suspension et résiliation</h2>
        <p>
          {legalConfig.brandName} peut suspendre ou fermer un compte en cas d&apos;utilisation abusive, frauduleuse ou
          contraire aux présentes conditions ou à la loi. L&apos;Utilisateur peut demander à tout moment la résiliation
          et la fermeture de son compte.
        </p>

        <h2>14. Export et fin de contrat</h2>
        <p>
          La Plateforme permet l&apos;export des données de l&apos;Utilisateur dans les formats proposés par le service.
          L&apos;Utilisateur est invité à exporter ses données avant la fermeture de son espace. À la fin du contrat,
          les données sont traitées conformément à la <a href="/confidentialite">politique de confidentialité</a> ;
          certaines données peuvent être conservées lorsque la loi (notamment comptable et fiscale) l&apos;impose.
        </p>

        <h2>15. Limitation de responsabilité</h2>
        <p>
          Dans les limites permises par la loi, la responsabilité de {legalConfig.brandName} ne saurait être engagée
          pour les dommages indirects résultant de l&apos;utilisation de la Plateforme, des services tiers, de la
          connexion internet ou des données saisies par l&apos;Utilisateur. Les présentes conditions ne limitent ni
          n&apos;excluent la responsabilité de {legalConfig.brandName} dans les cas où la loi l&apos;interdit.
        </p>

        <h2>16. Données personnelles</h2>
        <p>
          Le traitement des données personnelles est décrit dans la{" "}
          <a href="/confidentialite">politique de confidentialité</a>. Selon les traitements,{" "}
          {legalConfig.brandName} agit comme responsable du traitement (données du compte professionnel) ou comme
          sous-traitant technique (données des clients de l&apos;Utilisateur, dont l&apos;Utilisateur détermine les
          finalités).
        </p>

        <h2>17. Modification des conditions</h2>
        <p>
          {legalConfig.brandName} peut faire évoluer les présentes conditions. Toute modification substantielle est
          portée à la connaissance de l&apos;Utilisateur. La date de dernière mise à jour figure en haut de cette page.
        </p>

        <h2>18. Droit applicable et for</h2>
        <p>
          Les présentes conditions sont régies par le droit suisse. Sous réserve des dispositions impératives
          applicables, tout litige relève des tribunaux compétents du siège de l&apos;exploitant, à Genève. Une
          solution amiable sera recherchée avant toute action contentieuse.
        </p>
      </LegalContent>
    </>
  )
}
