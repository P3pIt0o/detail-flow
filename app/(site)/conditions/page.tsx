import type { Metadata } from "next"
import { legalConfig } from "@/config/legal"
import { PageHeader } from "@/components/layout/page-header"
import { LegalContent } from "@/components/layout/legal-content"

export const metadata: Metadata = {
  title: "Conditions générales DetailFlow",
  description:
    "Conditions générales d'utilisation et de vente de la plateforme DetailFlow, incluant les conditions du programme bêta.",
  alternates: { canonical: "/conditions" },
}

/**
 * ============================================================================
 *  CONDITIONS GÉNÉRALES — Plateforme DetailFlow (SaaS)
 * ============================================================================
 *  Page distincte des CGV par tenant (/cgv), qui sont le texte libre rédigé
 *  par chaque entreprise pour SES propres clients. Cette page-ci décrit les
 *  conditions de DetailFlow envers les entreprises utilisatrices, y compris
 *  les participantes au programme bêta.
 *
 *  ⚠️ Modèle à faire valider par un professionnel du droit — ne constitue pas
 *  un conseil juridique.
 * ============================================================================
 */
export default function ConditionsDetailFlowPage() {
  return (
    <>
      <PageHeader
        title="Conditions générales DetailFlow"
        description={`Dernière mise à jour : ${legalConfig.lastUpdated}`}
      />
      <LegalContent>
        <p>
          Les présentes conditions générales encadrent l&apos;accès et l&apos;utilisation de la plateforme{" "}
          <strong>DetailFlow</strong> (ci-après « la Plateforme ») par les entreprises professionnelles du detailing
          automobile (ci-après « l&apos;Utilisateur »). En créant un compte ou en utilisant la Plateforme,
          l&apos;Utilisateur accepte les présentes conditions.
        </p>

        <h2>1. Objet et description du service</h2>
        <p>
          DetailFlow est un logiciel en ligne (SaaS) permettant aux professionnels du detailing de gérer leur activité
          (prise de rendez-vous, réservations, clients, facturation, site vitrine, etc.). DetailFlow fournit un outil
          technique : la Plateforme n&apos;intervient pas dans la relation commerciale entre l&apos;Utilisateur et ses
          propres clients.
        </p>

        <h2>2. Programme bêta</h2>

        <h3>2.1 Accès au programme bêta</h3>
        <p>
          L&apos;accès au programme bêta est <strong>temporaire</strong> et réservé aux entreprises sélectionnées par
          DetailFlow. DetailFlow reste libre d&apos;accepter ou de refuser toute candidature au programme bêta, sans
          avoir à motiver sa décision. L&apos;accès à la bêta ne constitue pas un engagement de DetailFlow à fournir le
          service gratuitement de manière permanente.
        </p>

        <h3>2.2 Gratuité et conditions pendant la bêta</h3>
        <p>
          Lorsque l&apos;accès à la bêta est proposé gratuitement, cette gratuité concerne{" "}
          <strong>uniquement la période bêta</strong> communiquée à l&apos;Utilisateur. La participation au programme
          bêta ne confère aucun droit acquis à une utilisation gratuite de DetailFlow au-delà de cette période.
        </p>

        <h3>2.3 Passage à une offre payante</h3>
        <p>
          À l&apos;issue de la période bêta, DetailFlow pourra proposer l&apos;accès à la Plateforme sous la forme
          d&apos;une offre payante. Le prix définitif, les fonctionnalités comprises et les modalités de
          l&apos;offre seront communiqués à l&apos;Utilisateur <strong>avant toute souscription payante</strong>.
        </p>
        <p>
          <strong>
            Aucun prélèvement ni abonnement payant n&apos;est déclenché automatiquement du seul fait de la fin de la
            période bêta.
          </strong>{" "}
          L&apos;Utilisateur devra accepter explicitement l&apos;offre payante et ses conditions avant toute
          facturation. En cas de refus de l&apos;offre commerciale proposée à la fin de la bêta, l&apos;accès de
          l&apos;Utilisateur pourra être limité, suspendu ou supprimé selon les conditions communiquées par DetailFlow.
        </p>

        <h3>2.4 Avantage réservé aux bêta-testeurs</h3>
        <p>
          En contrepartie de leur participation, de leurs retours et de leur implication dans l&apos;amélioration de
          DetailFlow, les entreprises ayant participé au programme bêta pourront bénéficier d&apos;un tarif
          préférentiel par rapport au tarif public. Cet avantage éventuel ne garantit ni un tarif à vie, ni une
          réduction ou un pourcentage déterminés à l&apos;avance, ni une durée illimitée. DetailFlow conserve la
          faculté de définir ultérieurement le montant, la durée et les conditions de cet avantage. Les conditions
          exactes seront communiquées aux bêta-testeurs concernés avant toute éventuelle souscription.
        </p>

        <h3>2.5 Nature expérimentale de la bêta</h3>
        <p>
          Une version bêta est une version en cours de développement et d&apos;amélioration. Elle peut notamment
          comporter :
        </p>
        <ul>
          <li>des bugs ou anomalies ;</li>
          <li>des interruptions temporaires du service ;</li>
          <li>des fonctionnalités incomplètes ;</li>
          <li>des modifications d&apos;interface ;</li>
          <li>l&apos;ajout, la modification ou la suppression de certaines fonctionnalités.</li>
        </ul>
        <p>
          DetailFlow ne garantit pas que l&apos;ensemble des fonctionnalités présentes pendant la bêta seront
          conservées à l&apos;identique dans la version commerciale.
        </p>

        <h3>2.6 Retours des bêta-testeurs</h3>
        <p>
          Les bêta-testeurs peuvent transmettre des remarques, suggestions et idées d&apos;amélioration. DetailFlow
          pourra librement utiliser ces retours pour améliorer et faire évoluer son service. La transmission de tels
          retours ne crée pas automatiquement de droit à rémunération au profit du bêta-testeur, ni de droit de
          propriété de sa part sur les fonctionnalités développées à partir de ces retours, sans préjudice des droits
          que l&apos;Utilisateur détient sur ses propres données.
        </p>

        <h3>2.7 Données en fin de bêta</h3>
        <p>
          Si un bêta-testeur décide de ne pas poursuivre après la période bêta, son espace pourra être fermé. Ses
          données seront traitées conformément à la politique de confidentialité et à la réglementation applicable
          (notamment le RGPD). Certaines données pourront être conservées pendant les durées légales de conservation
          lorsque la loi l&apos;impose ; les autres données pourront être supprimées dans un délai raisonnable.
          L&apos;Utilisateur est invité à exporter ses données avant la fermeture de son espace lorsque cette
          fonctionnalité est disponible.
        </p>

        <h3>2.8 Évolution des conditions</h3>
        <p>
          Les conditions commerciales définitives pourront différer de celles applicables pendant la bêta. Toute offre
          payante sera présentée clairement à l&apos;Utilisateur avant son acceptation.
        </p>

        <h2>3. Propriété intellectuelle</h2>
        <p>
          La Plateforme DetailFlow, son code, sa marque, ses interfaces et l&apos;ensemble de ses éléments sont la
          propriété exclusive de DetailFlow et sont protégés par le droit de la propriété intellectuelle.
          L&apos;Utilisateur bénéficie d&apos;un droit d&apos;utilisation personnel, non exclusif et non cessible,
          limité à la durée de son accès. Il est interdit de copier, reproduire, décompiler, revendre, louer ou mettre
          à disposition de tiers tout ou partie du service, sauf autorisation écrite de DetailFlow.
        </p>

        <h2>4. Responsabilité de l&apos;Utilisateur et de ses contenus</h2>
        <p>
          L&apos;Utilisateur est seul responsable de l&apos;exactitude des informations qu&apos;il saisit, des
          contenus et photographies qu&apos;il importe, ainsi que du respect des droits de tiers (droits d&apos;auteur,
          droit à l&apos;image, etc.). Il garantit disposer des autorisations nécessaires pour les contenus publiés via
          la Plateforme. L&apos;Utilisateur est également seul responsable des prestations automobiles qu&apos;il vend
          et de la relation avec ses propres clients ; DetailFlow est un simple outil de gestion et reste indépendant
          de ces prestations.
        </p>

        <h2>5. Disponibilité et maintenance</h2>
        <p>
          DetailFlow met en œuvre des moyens raisonnables pour assurer la disponibilité de la Plateforme. Des
          opérations de maintenance, de correction ou de mise à jour peuvent entraîner une indisponibilité temporaire
          du service. Dans la mesure du possible, DetailFlow s&apos;efforce d&apos;informer les Utilisateurs des
          interruptions programmées. Cette clause ne saurait exonérer DetailFlow de sa responsabilité en cas de faute.
        </p>

        <h2>6. Limitation de responsabilité</h2>
        <p>
          Dans les limites permises par la loi, la responsabilité de DetailFlow ne saurait être engagée pour les
          dommages indirects résultant de l&apos;utilisation de la Plateforme. Les présentes conditions ne limitent ni
          n&apos;excluent la responsabilité de DetailFlow dans les cas où la loi l&apos;interdit, et ne portent pas
          atteinte aux droits légaux impératifs de l&apos;Utilisateur.
        </p>

        <h2>7. Suspension et résiliation</h2>
        <p>
          DetailFlow peut suspendre ou fermer un compte en cas d&apos;utilisation abusive, frauduleuse ou contraire aux
          présentes conditions ou à la loi. L&apos;Utilisateur peut demander la résiliation et la fermeture de son
          compte à tout moment. Les modalités relatives aux données en fin de contrat sont précisées à l&apos;article
          2.7 et dans la politique de confidentialité.
        </p>

        <h2>8. Données personnelles</h2>
        <p>
          Le traitement des données personnelles est décrit dans la{" "}
          <a href="/confidentialite">politique de confidentialité</a>, conforme au RGPD. L&apos;Utilisateur agit en
          qualité de responsable de traitement pour les données de ses propres clients, DetailFlow intervenant en tant
          que sous-traitant technique pour l&apos;hébergement et le fonctionnement de la Plateforme.
        </p>

        <h2>9. Droit applicable</h2>
        <p>
          Les présentes conditions sont soumises au droit français. En cas de litige, une solution amiable sera
          recherchée avant toute action contentieuse.
        </p>
      </LegalContent>
    </>
  )
}
